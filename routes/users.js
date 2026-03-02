const express = require("express");
const db = require("../db");
const { firebaseAuthMiddleware } = require("../middlewares/firebase_auth_middleware");

const router = express.Router();

/// 내 유저 정보 저장/갱신하기
router.post("/upsertMe", firebaseAuthMiddleware, async (req, res) => {
  const provider = req.provider;
  const providerUserId = req.uid;
  const { nickname, profileImageUrl } = req.body;

  const client = await db.connect();

  try {
    const result = await client.query(
      `
      insert into users (provider, provider_user_id, nickname, profile_image_url)
      values ($1, $2, $3, $4)
      on conflict (provider, provider_user_id)
      do update set
        nickname = excluded.nickname,
        profile_image_url = excluded.profile_image_url
      returning
        id,
        provider,
        provider_user_id as "providerUserId",
        nickname,
        profile_image_url as "profileImageUrl",
        created_at as "createdAt";
      `,
      [provider, providerUserId, nickname ?? null, profileImageUrl ?? null]
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
  } finally {
    client.release();
  }
});

/// 회원탈퇴 (DB 계정 삭제)
router.delete("/withdraw", firebaseAuthMiddleware, async (req, res) => {
  const userPk = req.userPk;

  const client = await db.connect();

  try {
    await client.query("begin");

    const ownerCheck = await client.query(
      `
      select 1
      from user_devices
      where user_pk = $1
        and role = 'owner'
      limit 1;
      `,
      [userPk]
    );

    if (ownerCheck.rowCount > 0) {
      await client.query("rollback");
      return res.status(403).json({
        success: false,
        message:
          "오너로 등록된 기기가 있어 회원탈퇴가 불가능합니다. 소유권 이전 후 다시 시도해 주세요.",
        data: null,
      });
    }

    // users 삭제 → user_devices, fcm_tokens는 ON DELETE CASCADE로 자동 삭제됨
    await client.query(
      `
      delete from users
      where id = $1;
      `,
      [userPk]
    );

    await client.query("commit");

    return res.json({
      success: true,
      message: "회원탈퇴가 완료되었습니다.",
      data: null,
    });
  } catch (e) {
    console.error(e);

    try {
      await client.query("rollback");
    } catch (rollbackError) {
      console.error(rollbackError);
    }

    return res.status(500).json({
      success: false,
      message: e.message,
      data: null,
    });
  } finally {
    client.release();
  }
});

module.exports = router;