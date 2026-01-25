require("dotenv").config();

const mqtt = require("mqtt");
const pool = require("../db");

// mqtt 메시지 로그를 DB에 저장
async function insertMqttLog({ deviceId, topic, payload }) {
  try {
    await pool.query(
      "insert into mqtt_logs (device_id, topic, payload) values ($1, $2, $3)",
      [deviceId, topic, payload]
    );
  } catch (err) {
    console.error("[MQTT] log insert error:", err?.message ?? err);
  }
}

function createMqttClient() {
  const mqttUrl = `mqtts://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`;

  const client = mqtt.connect(mqttUrl, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
  });

  client.on("connect", () => {
    console.log("[MQTT] connected:", mqttUrl);

    client.subscribe("feeder/#", { qos: 1 }, (err) => {
      if (err) {
        console.error("[MQTT] subscribe error:", err?.message ?? err);
      } else {
        console.log("[MQTT] subscribed: feeder/#");
      }
    });
  });

  client.on("message", (topic, payload) => {
    const message = payload ? payload.toString("utf8") : null;
    const deviceId = String(topic).split("/")[1];

    if (message && message.length > 0) {
      console.log(`mqtt received:${topic}/${message}`);
    } else {
      console.log(`mqtt received:${topic}`);
    }

    insertMqttLog({
      deviceId,
      topic,
      payload: message && message.length > 0 ? message : null,
    });
  });

  client.on("error", (err) => {
    console.error("[MQTT] error:", err?.message ?? err);
  });

  client.on("close", () => {
    console.log("[MQTT] closed");
  });

  return client;
}

module.exports = {
  createMqttClient,
};
