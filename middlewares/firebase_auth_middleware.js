const admin = require("firebase-admin");
const db = require("../db");

const firebaseAuthMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  const client = await db.connect();

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    const signInProvider = decoded.firebase?.sign_in_provider ?? null;
    const provider = signInProvider ? signInProvider.replace(".com", "") : null;

    req.provider = provider;
    req.uid = decoded.uid;

    const result = await client.query(
      `
      insert into users (provider, provider_user_id)
      values ($1, $2)
      on conflict (provider, provider_user_id)
      do update set
        provider = excluded.provider,
        provider_user_id = excluded.provider_user_id
      returning id;
      `,
      [req.provider, req.uid]
    );

    req.userPk = result.rows[0].id;

    return next();
  } catch (e) {
    return res.status(401).json({
      success: false,
      message: "유효하지 않은 토큰입니다.",
      data: null,
    });
  } finally {
    client.release();
  }
};

module.exports = { firebaseAuthMiddleware };