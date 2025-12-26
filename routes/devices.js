const express = require("express");
const db = require("../db");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { deviceId, deviceName, location } = req.body;

  try {
    const result = await db.query(
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

    return res.json({
      success: true,
      message: "기기가 성공적으로 등록되었습니다.",
      data: result.rows[0],
    });
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "이미 등록된 기기입니다.",
        data: null,
      });
    }

    console.error(e);
    return res.status(500).json({
      success: false,
      message: e.message,
      data: null,
    });
  }
});

module.exports = router;
