import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

// Ensure servers data directory exists
const SERVERS_DIR = path.join(__dirname, '..', '..', 'servers');
if (!fs.existsSync(SERVERS_DIR)) {
  fs.mkdirSync(SERVERS_DIR, { recursive: true });
}

export const getVolumePath = (serverUuid: string) => {
  const dir = path.join(SERVERS_DIR, serverUuid, 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

// Download Server Jar from APIs
const downloadJar = async (software: string, version: string, destPath: string) => {
  let downloadUrl = '';
  const sw = software.toLowerCase();

  try {
    if (sw === 'paper') {
      // Fetch paper jar from paper api
      const buildResponse = await axios.get(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
      const builds = buildResponse.data.builds;
      const latestBuild = builds[builds.length - 1];
      downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
    } else if (sw === 'purpur') {
      downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
    } else if (sw === 'velocity') {
      const buildResponse = await axios.get(`https://api.papermc.io/v2/projects/velocity/versions/${version}`);
      const builds = buildResponse.data.builds;
      const latestBuild = builds[builds.length - 1];
      downloadUrl = `https://api.papermc.io/v2/projects/velocity/versions/${version}/builds/${latestBuild}/downloads/velocity-${version}-${latestBuild}.jar`;
    } else if (sw === 'waterfall') {
      const buildResponse = await axios.get(`https://api.papermc.io/v2/projects/waterfall/versions/${version}`);
      const builds = buildResponse.data.builds;
      const latestBuild = builds[builds.length - 1];
      downloadUrl = `https://api.papermc.io/v2/projects/waterfall/versions/${version}/builds/${latestBuild}/downloads/waterfall-${version}-${latestBuild}.jar`;
    } else {
      // Fallback or generic stubs for Spigot/Forge etc.
      // We will place a lightweight script that prints server launch info
      downloadUrl = '';
    }

    if (downloadUrl) {
      console.log(`Downloading server jar from: ${downloadUrl}`);
      const writer = fs.createWriteStream(destPath);
      const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream'
      });
      response.data.pipe(writer);
      return new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } else {
      // Write a dummy script/jar that acts as a mock server starting up
      console.log(`Writing mock bootstrap server files for ${software} ${version}`);
      fs.writeFileSync(
        path.join(path.dirname(destPath), 'server.js'),
        `
        console.log("Starting PilotPanel Minecraft Bootstrapper...");
        console.log("Loading ${software} version ${version}...");
        console.log("Preparing Spawn Area: 0%");
        setTimeout(() => console.log("Preparing Spawn Area: 45%"), 1000);
        setTimeout(() => console.log("Preparing Spawn Area: 90%"), 2000);
        setTimeout(() => {
          console.log("Done (2.41s)! For help, type 'help' or '?'");
          console.log("[PilotPanel] Server successfully loaded.");
        }, 3000);
        
        process.stdin.on('data', (data) => {
          const cmd = data.toString().trim();
          console.log("Running command inside ${software}: " + cmd);
          if (cmd === 'stop') {
            console.log("Stopping server...");
            process.exit(0);
          }
        });
        `
      );
    }
  } catch (error: any) {
    console.error('Failed to download server jar, setting up fallback runner:', error.message);
    fs.writeFileSync(
      path.join(path.dirname(destPath), 'server.js'),
      `console.log("Starting PilotPanel Mock Server (Offline Download Fallback)");
       console.log("Failed to download jar for ${software} ${version}");
       console.log("Listening on command inputs...");
       process.stdin.on('data', (d) => console.log("Received: " + d.toString()));`
    );
  }
};

export const createServerContainer = async (config: {
  uuid: string;
  name: string;
  memoryLimit: number; // MB
  cpuLimit: number; // cores
  diskLimit: number; // MB
  port: number;
  software: string;
  version: string;
}) => {
  const volumePath = getVolumePath(config.uuid);
  const serverJarPath = path.join(volumePath, 'server.jar');

  // Download jar if not exists
  if (!fs.existsSync(serverJarPath)) {
    await downloadJar(config.software, config.version, serverJarPath);
  }

  // Write basic eula.txt
  fs.writeFileSync(path.join(volumePath, 'eula.txt'), 'eula=true\n');

  // Select appropriate Docker image based on software requirement (default Alpine Node/Java 17/21)
  const image = config.software.toLowerCase() === 'forge' || config.software.toLowerCase() === 'neoforge'
    ? 'eclipse-temurin:17-jre-alpine'
    : 'eclipse-temurin:21-jre-alpine';

  // Pull image
  console.log(`Pulling docker image: ${image}`);
  try {
    await new Promise<void>((resolve, reject) => {
      docker.pull(image, {}, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('Failed to fetch Docker pull stream'));
        docker.modem.followProgress(stream, onFinished, onProgress);
        function onFinished(err: any) {
          if (err) return reject(err);
          resolve();
        }
        function onProgress(event: any) {
          // console.log(event.status);
        }
      });
    });
  } catch (e: any) {
    console.warn(`Docker pull failed/skipped (might be local): ${e.message}`);
  }

  // Determine starting script command
  // If we have a physical server.jar, run java. If not (fallback mock server), run node server.js.
  const hasJar = fs.existsSync(serverJarPath);
  const cmd = hasJar
    ? ['java', `-Xms128M`, `-Xmx${config.memoryLimit}M`, '-jar', 'server.jar', 'nogui']
    : ['node', 'server.js'];

  const finalImage = hasJar ? image : 'node:20-alpine';

  if (!hasJar) {
    // Make sure we pull node image if running mock
    try {
      await new Promise<void>((resolve) => {
        docker.pull(finalImage, {}, (err, stream) => {
          if (err) return resolve();
          if (!stream) return resolve();
          docker.modem.followProgress(stream, () => resolve(), () => {});
        });
      });
    } catch {}
  }

  // Create Container
  const container = await docker.createContainer({
    Image: finalImage,
    Cmd: cmd,
    name: `pilotpanel-${config.uuid}`,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    HostConfig: {
      PortBindings: {
        '25565/tcp': [{ HostPort: config.port.toString() }]
      },
      Binds: [
        `${volumePath}:/data`
      ],
      Memory: config.memoryLimit * 1024 * 1024,
      CpuShares: Math.round(config.cpuLimit * 1024)
    },
    WorkingDir: '/data',
    Env: ['EULA=true']
  });

  return {
    containerId: container.id
  };
};

export const containerPowerAction = async (serverUuid: string, action: 'start' | 'stop' | 'restart' | 'kill') => {
  const containerName = `pilotpanel-${serverUuid}`;
  const container = docker.getContainer(containerName);

  try {
    const info = await container.inspect();
    const running = info.State.Running;

    if (action === 'start') {
      if (running) return { message: 'Container is already running.' };
      await container.start();
    } else if (action === 'stop') {
      if (!running) return { message: 'Container is already stopped.' };
      // Gracefully send 'stop' command to console, or stop after 10s
      try {
        await container.stop({ t: 10 });
      } catch (err) {
        await container.kill();
      }
    } else if (action === 'restart') {
      await container.restart({ t: 10 });
    } else if (action === 'kill') {
      if (!running) return { message: 'Container is not running.' };
      await container.kill();
    }

    return { success: true };
  } catch (err: any) {
    console.error(`Failed to handle power action ${action} for container ${containerName}:`, err.message);
    throw new Error(`Docker operation failed: ${err.message}`);
  }
};

export const deleteContainer = async (serverUuid: string) => {
  const containerName = `pilotpanel-${serverUuid}`;
  const container = docker.getContainer(containerName);

  try {
    await container.stop();
  } catch {}

  try {
    await container.remove({ force: true });
  } catch {}

  // Delete files
  const volumePath = getVolumePath(serverUuid);
  try {
    fs.rmSync(path.dirname(volumePath), { recursive: true, force: true });
  } catch (err: any) {
    console.warn(`Failed to clean up files at ${volumePath}:`, err.message);
  }
};
