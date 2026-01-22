require("dotenv").config();

const mqtt = require("mqtt");

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
    const message = payload ? payload.toString("utf8") : "";
    if (message.length > 0) {
      console.log(`mqtt received:${topic}/${message}`);
    } else {
      console.log(`mqtt received:${topic}`);
    }
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
