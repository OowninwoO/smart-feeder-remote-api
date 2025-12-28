const express = require("express");
const db = require("../db");
const { firebaseAuthMiddleware } = require("../middlewares/firebase_auth_middleware");

const router = express.Router();

/// 기기 등록하기
router.post("/register", firebaseAuthMiddleware, async (req, res) => {
  const { deviceId, deviceName, location } = req.body;
  const userId = req.uid;

  const client = await db.connect();

  try {
    await client.query("begin");

    const deviceResult = await client.query(
      `
      insert into devices (device_id, device_name, location)
      values ($1, $2, $3)
      returning
        id,
        device_id as "deviceId",
        device_name as "deviceName",
        location,
        created_at as "createdAt";
      `,
      [deviceId, deviceName, location]
    );

    const devicePk = deviceResult.rows[0].id;

    await client.query(
      `
      insert into user_devices (user_id, device_pk, role)
      values ($1, $2, 'owner');
      `,
      [userId, devicePk]
    );

    await client.query("commit");

    return res.json({
      success: true,
      message: "기기가 성공적으로 등록되었습니다.",
      data: deviceResult.rows[0],
    });
  } catch (e) {
    console.error(e);

    try {
      await client.query("rollback");
    } catch (rollbackError) {
      console.error(rollbackError);
    }

    if (e.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "이미 등록된 기기입니다.",
        data: null,
      });
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

/// 내 기기 조회하기
router.get("/my-devices", firebaseAuthMiddleware, async (req, res) => {
  const userId = req.uid;
  const client = await db.connect();

  try {
    const result = await client.query(
      `
      select
        d.id,
        d.device_id as "deviceId",
        d.device_name as "deviceName",
        d.location,
        d.created_at as "createdAt",
        ud.role,
        ud.created_at as "linkedAt"
      from user_devices ud
      join devices d on d.id = ud.device_pk
      where ud.user_id = $1
      order by
        (ud.role = 'owner') desc,
        ud.created_at desc;
      `,
      [userId]
    );

    return res.json({
      success: true,
      message: "내 기기 목록 조회에 성공했습니다.",
      data: result.rows,
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

module.exports = router;
