require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

const devicesRoutes = require("./routes/devices");
const usersRoutes = require("./routes/users");
const fcmTokensRoutes = require("./routes/fcm_tokens");
const mqttLogsRoutes = require("./routes/mqtt_logs");
const { createMqttClient } = require("./mqtt/mqtt_client");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

app.use(express.json());
app.use("/api/devices", devicesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/fcmTokens", fcmTokensRoutes);
app.use("/api/mqtt-logs", mqttLogsRoutes);

createMqttClient();

const port = process.env.PORT;

app.listen(port, "0.0.0.0", () => {
  console.log(`smart_feeder_remote_api on http://0.0.0.0:${port}`);
});
