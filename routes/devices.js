const express = require("express");
const db = require("../db");
const { firebaseAuthMiddleware } = require("../middlewares/firebase_auth_middleware");

const router = express.Router();

/// 기기 등록하기
router.post("/register", firebaseAuthMiddleware, async (req, res) => {
  const { deviceId, deviceName, location } = req.body;
  const userPk = req.userPk;

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
      insert into user_devices (user_pk, device_pk, role)
      values ($1, $2, 'owner');
      `,
      [userPk, devicePk]
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
  const userPk = req.userPk;
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
      where ud.user_pk = $1
      order by
        (ud.role = 'owner') desc,
        ud.created_at desc;
      `,
      [userPk]
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

/// 기기 삭제(owner는 기기 자체 삭제, member는 내 연결만 해제)
router.delete("/:deviceId", firebaseAuthMiddleware, async (req, res) => {
  const userPk = req.userPk;
  const { deviceId } = req.params;

  const client = await db.connect();

  try {
    await client.query("begin");

    const targetResult = await client.query(
      `
      select
        d.id as "devicePk",
        ud.role
      from devices d
      join user_devices ud on ud.device_pk = d.id
      where d.device_id = $1
        and ud.user_pk = $2;
      `,
      [deviceId, userPk]
    );

    if (targetResult.rowCount === 0) {
      await client.query("rollback");
      return res.status(404).json({
        success: false,
        message: "기기를 찾을 수 없습니다.",
        data: null,
      });
    }

    const { devicePk, role } = targetResult.rows[0];

    if (role === "owner") {
      await client.query(
        `
        delete from devices
        where id = $1;
        `,
        [devicePk]
      );
    } else {
      await client.query(
        `
        delete from user_devices
        where user_pk = $1
          and device_pk = $2;
        `,
        [userPk, devicePk]
      );
    }

    await client.query("commit");

    return res.json({
      success: true,
      message: "기기가 삭제되었습니다.",
      data: { deviceId, role },
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
