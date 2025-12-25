const express = require("express");
const db = require("../db");

const router = express.Router();

router.post("/upsertMe", async (req, res) => {
  const { provider, providerUserId, nickname, profileImageUrl } = req.body;

  try {
    const result = await db.query(
      `
      insert into users (provider, provider_user_id, nickname, profile_image_url)
      values ($1, $2, $3, $4)
      on conflict (provider, provider_user_id)
      do update set
        nickname = excluded.nickname,
        profile_image_url = excluded.profile_image_url
      returning id, provider, provider_user_id as "providerUserId", nickname, profile_image_url as "profileImageUrl", created_at as "createdAt";
      `,
      [provider, providerUserId, nickname ?? null, profileImageUrl ?? null]
    );

    return res.json({
      success: true,
      message: "유저 정보가 성공적으로 저장되었습니다.",
      data: result.rows[0],
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      message: e.message,
      data: null,
    });
  }
});

module.exports = router;
