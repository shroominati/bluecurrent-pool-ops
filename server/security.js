const crypto = require("crypto");

function createPasswordRecord(password, providedSalt = "") {
  const salt = providedSalt || crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, "sha512").toString("hex");
  return { passwordHash, passwordSalt: salt };
}

function verifyPassword(password, record) {
  if (!record?.passwordHash || !record?.passwordSalt) {
    return false;
  }

  const comparison = createPasswordRecord(password, record.passwordSalt);
  return crypto.timingSafeEqual(
    Buffer.from(record.passwordHash, "hex"),
    Buffer.from(comparison.passwordHash, "hex"),
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

module.exports = {
  createPasswordRecord,
  hashToken,
  verifyPassword,
};
