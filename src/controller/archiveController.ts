import fs from 'fs';
import { constants } from 'fs/promises';
import tar from 'tar';

import { ServerOptions } from '../types/ServerOptions';

const MAX_RETRIES = 5;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SESSIONS_PATH = (serverOptions: ServerOptions) =>
  `../../../${serverOptions.efsMountContainerPath}/archives`;

export async function zipSession(
  customerId: string,
  serverOptions: ServerOptions
) {
  const DATA_PATH = serverOptions.customUserDataDir;
  let successFullyZipped = false;
  let retries = 0;
  while (!successFullyZipped) {
    try {
      // create SESSIONS_PATH directory if it doesn't exist
      const dirPath = SESSIONS_PATH(serverOptions);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const filePath = `${SESSIONS_PATH}/${customerId}.zip`;
      await tar.c({ file: filePath, cwd: DATA_PATH }, [`${customerId}`]);
      successFullyZipped = true;
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

export async function discardSessionArchive(
  customerId: string,
  serverOptions: ServerOptions
) {
  const fileName = `${customerId}.zip`;

  const target = `${SESSIONS_PATH(serverOptions)}/${fileName}`;

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

async function isExists(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    fs.access(target, constants.F_OK, async (err) => {
      if (err) return resolve(false);
      return resolve(true);
    });
  });
}

export async function unzipSession(
  customerId: string,
  serverOptions: ServerOptions
) {
  const fileName = `${customerId}.zip`;

  const target = `${SESSIONS_PATH(serverOptions)}/${fileName}`;

  if (await isExists(target)) {
    let successFullyUnZipped = false;
    let retries = 0;
    while (!successFullyUnZipped) {
      try {
        await tar.x({
          file: target,
          cwd: SESSIONS_PATH(serverOptions),
        });
        successFullyUnZipped = true;
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
  }
}
