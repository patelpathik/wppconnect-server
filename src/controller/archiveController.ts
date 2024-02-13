import { Request } from 'express';
import fs from 'fs';
import { constants } from 'fs/promises';
import tar from 'tar';

import { ServerOptions } from '../types/ServerOptions';

const MAX_RETRIES = 5;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SESSIONS_PATH = (serverOptions: ServerOptions) =>
  `../../../${serverOptions.efsMountContainerPath}/archives`;

// * List of routes to ignore archive/extract
const archiveIgnoreRoutes: string[] = [
  '/logout-session',
  '/clear-session-data',
  '/close-session',
];

// * Utility promise to check path to file/dir exists or not (fs)
async function isExists(req: Request, target: string): Promise<boolean> {
  return new Promise((resolve) => {
    fs.access(target, constants.F_OK, async (err) => {
      req.logger.info(`isExists::${target} ${err}`);
      if (err) return resolve(false);
      return resolve(true);
    });
  });
}

async function archiveSession(req: Request, serverOptions: ServerOptions) {
  const customerId = req.session;
  req.logger.info(`ZIP SESSION::${customerId}`);
  const DATA_PATH = serverOptions.customUserDataDir;
  let successFullyZipped = false;
  let retries = 0;
  while (!successFullyZipped) {
    try {
      // create SESSIONS_PATH directory if it doesn't exist
      const dirPath = SESSIONS_PATH(serverOptions);
      req.logger.info(`dirPath ${dirPath}`);
      if (!(await isExists(req, dirPath))) {
        req.logger.info(`create dir ${dirPath}`);
        await fs.mkdir(dirPath, (err) => {
          req.logger.info(`mkdir-error::${err}`);
        });
      }

      const filePath = `${dirPath}/${customerId}.zip`;
      req.logger.info(`filePath ${filePath}`);
      req.logger.info(`cwd ${process.cwd()}`);
      await tar.c({ file: filePath, cwd: DATA_PATH }, [`${customerId}`]);
      successFullyZipped = true;
      req.logger.info(`zip complete`);
    } catch (error) {
      console.error(`Error in zipSession: ${JSON.stringify(error)}`);
      if (retries > MAX_RETRIES) {
        console.error('Maximum number of retries reached. Exiting.');
        break;
      }
      // increasing delayTime with every retry (exponential back-off)
      const delayTime = Math.pow(2, retries) * 1000;
      console.info(`Retrying in ${delayTime / 1000} seconds...`);
      await delay(delayTime);
      retries += 1;
    }
  }
  return;
}

async function extractSession(req: Request, serverOptions: ServerOptions) {
  const customerId = req.session;
  req.logger.info(`UNZIP SESSION::${customerId}`);
  const fileName = `${customerId}.zip`;

  const target = `${SESSIONS_PATH(serverOptions)}/${fileName}`;

  const DATA_PATH = serverOptions.customUserDataDir;

  if (await isExists(req, target)) {
    let successFullyUnZipped = false;
    let retries = 0;
    while (!successFullyUnZipped) {
      try {
        await tar.x({
          file: target,
          cwd: DATA_PATH,
        });
        req.logger.info(`target ${target}`);
        req.logger.info(`cwd ${SESSIONS_PATH(serverOptions)}`);
        successFullyUnZipped = true;
        req.logger.info(`unzip complete`);
      } catch (error) {
        console.error(`Error in unZipSession: ${JSON.stringify(error)}`);
        if (retries > MAX_RETRIES) {
          console.error('Maximum number of retries reached. Exiting.');
          break;
        }
        // increasing delayTime with every retry (exponential back-off)
        const delayTime = Math.pow(2, retries) * 1000;
        console.info(`Retrying in ${delayTime / 1000} seconds...`);
        await delay(delayTime);
        retries += 1;
      }
    }
  } else {
    req.logger.info('extract skipped, file not found');
  }
}

async function discardSessionArchive(
  req: Request,
  serverOptions: ServerOptions
) {
  const customerId = req.session;
  req.logger.info(`DISCARD SESSION::${customerId}`);
  const fileName = `${customerId}.zip`;

  const target = `${SESSIONS_PATH(serverOptions)}/${fileName}`;
  req.logger.info(`target ${target}`);
  fs.access(target, constants.F_OK, async (err) => {
    if (err) {
      console.error(`archive not found at '${target}' to discard`);
    } else {
      await fs.unlink(target, (err) => {
        if (err) console.error(`target: ${target} delete error, ${err}`);
        else console.error(`target: ${target} removed`);
      });
    }
  });
}

export async function handleOnInit(req: Request) {
  // unZip
  req.logger.info(
    `req.session::${req.session}, req.params.session::${req.params.session}`
  );
  if (req.session) {
    const path: string = req.originalUrl;
    req.logger.info(
      `archiveIgnoreRoutes::${archiveIgnoreRoutes.some((r) =>
        path.includes(r)
      )}`
    );
    if (!archiveIgnoreRoutes.some((r) => path.includes(r))) {
      req.logger.info('unzip');
      await extractSession(req, req.serverOptions);
    }
  }
}

export async function handleOnFinish(req: Request) {
  // Zip here for all/filter the requests
  if (req.session) {
    const path: string = req.originalUrl;
    if (archiveIgnoreRoutes.some((r) => path.includes(r))) {
      req.logger.info('discard');
      await discardSessionArchive(req, req.serverOptions);
    } else {
      req.logger.info('zip');
      await archiveSession(req, req.serverOptions);
    }
  }
}
