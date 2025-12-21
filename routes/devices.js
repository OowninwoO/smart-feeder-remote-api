const express = require("express");

const router = express.Router();

router.post("/register", (req, res) => {
  const { deviceId, deviceName } = req.body;

  return res.json({
    success: true,
    deviceId: deviceId,
    deviceName: deviceName,
  });
});

module.exports = router;
