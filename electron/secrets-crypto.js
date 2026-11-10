// Mã hóa và giải mã cấu hình secrets nhúng cho ứng dụng Electron
const crypto = require("node:crypto");

const SECRET_PASSPHRASE = "anima-studio-desktop-secrets-embedded-key-2026";
const SECRET_SALT = "anima-secrets-salt-v1";
const DERIVED_KEY = crypto.scryptSync(SECRET_PASSPHRASE, SECRET_SALT, 32);
const CURRENT_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// Mã hóa đối tượng dữ liệu thành Buffer nhị phân AES-256-GCM
function encrypt(obj) {
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", DERIVED_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const versionBuf = Buffer.from([CURRENT_VERSION]);
  return Buffer.concat([versionBuf, iv, tag, ciphertext]);
}

// Giải mã Buffer nhị phân thành đối tượng dữ liệu gốc
function decrypt(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 1 + IV_LENGTH + TAG_LENGTH) {
    throw new Error("Dữ liệu secrets mã hóa không hợp lệ hoặc quá ngắn");
  }
  const version = buf[0];
  if (version !== CURRENT_VERSION) {
    throw new Error(`Phiên bản secrets không được hỗ trợ: ${version}`);
  }
  const iv = buf.subarray(1, 1 + IV_LENGTH);
  const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", DERIVED_KEY, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

module.exports = {
  encrypt,
  decrypt,
  VERSION: CURRENT_VERSION,
};
