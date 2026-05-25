const fs = require('fs');

const GOOGLE_SERVICES_FILE = './google-services.json';

module.exports = ({ config }) => {
  const googleServicesJsonBase64 = process.env.GOOGLE_SERVICES_JSON_BASE64;

  if (googleServicesJsonBase64 && !fs.existsSync(GOOGLE_SERVICES_FILE)) {
    const decodedGoogleServicesJson = Buffer.from(googleServicesJsonBase64, 'base64').toString('utf8');
    JSON.parse(decodedGoogleServicesJson);
    fs.writeFileSync(GOOGLE_SERVICES_FILE, decodedGoogleServicesJson);
  }

  const androidConfig = {
    ...config.android,
  };

  if (fs.existsSync(GOOGLE_SERVICES_FILE)) {
    androidConfig.googleServicesFile = GOOGLE_SERVICES_FILE;
  }

  return {
    ...config,
    android: androidConfig,
  };
};
