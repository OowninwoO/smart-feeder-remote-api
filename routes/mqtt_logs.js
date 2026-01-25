const express = require("express");
const db = require("../db");
const { firebaseAuthMiddleware } = require("../middlewares/firebase_auth_middleware");

const router = express.Router();

router.get("/list", firebaseAuthMiddleware, async (req, res) => {
  const { deviceId } = req.query;
  const client = await db.connect();

  try {
    const result = await client.query(
      `
      select
        id,
        received_at as "receivedAt",
        device_id as "deviceId",
        topic,
        payload
      from mqtt_logs
      where device_id = $1
      order by id desc;
      `,
      [deviceId]
    );

    return res.json({
      success: true,
      message: "MQTT 로그 조회에 성공했습니다.",
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
