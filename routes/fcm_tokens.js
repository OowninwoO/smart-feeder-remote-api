const express = require("express");
const db = require("../db");
const { firebaseAuthMiddleware } = require("../middlewares/firebase_auth_middleware");

const router = express.Router();

/// FCM 토큰 저장/갱신 요청
router.post("/upsert", firebaseAuthMiddleware, async (req, res) => {
  const userPk = req.userPk;
  const { token } = req.body;

  try {
    const result = await db.query(
      `
      insert into fcm_tokens (user_pk, token)
      values ($1, $2)
      on conflict (user_pk)
      do update set
        token = excluded.token,
        updated_at = now()
      returning token;
      `,
      [userPk, token]
    );

    return res.json({
      success: true,
      message: "FCM 토큰이 성공적으로 저장되었습니다.",
      data: result.rows[0],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      success: false,
      message: e.message,
      data: null,
    });
  }
});

module.exports = router;
