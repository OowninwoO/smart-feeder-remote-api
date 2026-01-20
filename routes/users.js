const express = require("express");
const db = require("../db");
const { firebaseAuthMiddleware } = require("../middlewares/firebase_auth_middleware");

const router = express.Router();

router.post("/upsertMe", firebaseAuthMiddleware, async (req, res) => {
  const userPk = req.userPk;
  const provider = req.provider;
  const providerUserId = req.uid;
  const { nickname, profileImageUrl } = req.body;

  try {
    const result = await db.query(
      `
      insert into users (id, provider, provider_user_id, nickname, profile_image_url)
      values ($1, $2, $3, $4, $5)
      on conflict (provider, provider_user_id)
      do update set
        nickname = excluded.nickname,
        profile_image_url = excluded.profile_image_url
      returning id, provider, provider_user_id as "providerUserId", nickname, profile_image_url as "profileImageUrl", created_at as "createdAt";
      `,
      [userPk, provider, providerUserId, nickname ?? null, profileImageUrl ?? null]
    );

    return res.json({
      success: true,
      message: "유저 정보가 성공적으로 저장되었습니다.",
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
