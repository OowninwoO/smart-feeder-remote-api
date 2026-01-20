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

    const result = await db.query(
      `
      select id
      from users
      where provider = $1
        and provider_user_id = $2
      limit 1;
      `,
      [req.provider, req.uid]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "유저 정보를 찾을 수 없습니다.",
        data: null,
      });
    }

    req.userPk = result.rows[0].id;

    next();
  } catch (e) {
    return res.status(401).json({
      success: false,
      message: "유효하지 않은 토큰입니다.",
      data: null,
    });
  }
};

module.exports = { firebaseAuthMiddleware };
