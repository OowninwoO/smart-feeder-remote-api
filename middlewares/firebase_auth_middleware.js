const admin = require("firebase-admin");
const db = require("../db");

const firebaseAuthMiddleware = async (req, res, next) => {
  const token = req.headers.authorization.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);

    const signInProvider = decoded.firebase?.sign_in_provider ?? null;
    const provider = signInProvider ? signInProvider.replace(".com", "") : null;

    if (!provider) {
      return res.status(401).json({
        success: false,
        message: "인증 제공자 정보를 확인할 수 없습니다.",
        data: null,
      });
    }

    req.provider = provider;
    req.uid = decoded.uid;

    const selectResult = await db.query(
      `
      select id
      from users
      where provider = $1
        and provider_user_id = $2
      limit 1;
      `,
      [req.provider, req.uid]
    );

    if (selectResult.rowCount > 0) {
      req.userPk = selectResult.rows[0].id;
      return next();
    }

    const insertResult = await db.query(
      `
      insert into users (provider, provider_user_id)
      values ($1, $2)
      returning id;
      `,
      [req.provider, req.uid]
    );

    req.userPk = insertResult.rows[0].id;

    return next();
  } catch (e) {
    return res.status(401).json({
      success: false,
      message: "유효하지 않은 토큰입니다.",
      data: null,
    });
  }
};

module.exports = { firebaseAuthMiddleware };
