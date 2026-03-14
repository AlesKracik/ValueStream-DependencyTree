import { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { getSettingsPath } from './settings';
import { unmaskSettings } from '../utils/configHelpers';

const execPromise = promisify(exec);

export const awsRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post('/api/aws/sso/login', async (request, reply) => {
    try {
      const rawConfig = request.body as any;
      const settingsPath = getSettingsPath();
      const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
      const config = unmaskSettings(rawConfig, existing);
      
      const role = config.role || 'app';
      const auth = config.persistence?.mongo?.[role]?.auth || {};
      const profile = auth.aws_profile;
      const sso_start_url = auth.aws_sso_start_url;
      const sso_region = auth.aws_sso_region;
      const sso_account_id = auth.aws_sso_account_id;
      const sso_role_name = auth.aws_sso_role_name;

      const envVars = { ...process.env };
      const profileName = profile || 'temp-sso-profile';
      
      if (!profile && sso_start_url) {
        const tempConfigPath = path.join(os.tmpdir(), `aws_config_${crypto.randomBytes(4).toString('hex')}`);
        fs.writeFileSync(tempConfigPath, `[profile ${profileName}]\nsso_start_url = ${sso_start_url}\nsso_region = ${sso_region}\nsso_account_id = ${sso_account_id}\nsso_role_name = ${sso_role_name}\nregion = ${sso_region}\n`);
        envVars.AWS_CONFIG_FILE = tempConfigPath;
      }
      
      const child = spawn(`aws sso login --profile ${profileName} --use-device-code`, { shell: true, env: envVars });
      
      let capturedOutput = '';
      const outputPromise = new Promise<string>((resolve) => {
        const timeout = setTimeout(() => resolve(capturedOutput || 'Login initiated (check logs if no URL appears)'), 4000);
        
        const handleData = (data: any) => {
          const str = data.toString();
          capturedOutput += str;
          if (str.includes('https://') || str.includes('code:')) {
            clearTimeout(timeout);
            setTimeout(() => resolve(capturedOutput), 500);
          }
        };
        
        child.stdout.on('data', handleData);
        child.stderr.on('data', handleData);
      });

      const message = await outputPromise;
      
      return reply.send({ success: true, message });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

  fastify.post('/api/aws/sso/credentials', async (request, reply) => {
    try {
      const rawConfig = request.body as any;
      const settingsPath = getSettingsPath();
      const existing = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {};
      const config = unmaskSettings(rawConfig, existing);
      
      const role = config.role || 'app';
      const auth = config.persistence?.mongo?.[role]?.auth || {};
      const profile = auth.aws_profile;
      const sso_start_url = auth.aws_sso_start_url;
      const sso_region = auth.aws_sso_region;
      const sso_account_id = auth.aws_sso_account_id;
      const sso_role_name = auth.aws_sso_role_name;

      const envVars = { ...process.env };
      const profileName = profile || 'temp-sso-profile';
      let tempPath = '';
      
      if (!profile && sso_start_url) {
        tempPath = path.join(os.tmpdir(), `aws_config_${crypto.randomBytes(4).toString('hex')}`);
        fs.writeFileSync(tempPath, `[profile ${profileName}]\nsso_start_url = ${sso_start_url}\nsso_region = ${sso_region}\nsso_account_id = ${sso_account_id}\nsso_role_name = ${sso_role_name}\nregion = ${sso_region}\n`);
        envVars.AWS_CONFIG_FILE = tempPath;
      }
      
      const { stdout } = await execPromise(`aws configure export-credentials --profile ${profileName}`, { env: envVars });
      
      if (tempPath) {
          try { fs.unlinkSync(tempPath); } catch(e) {}
      }
      
      const creds = JSON.parse(stdout);
      return reply.send({ 
          success: true, 
          accessKey: creds.AccessKeyId, 
          secretKey: creds.SecretAccessKey, 
          sessionToken: creds.SessionToken 
      });
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

};
