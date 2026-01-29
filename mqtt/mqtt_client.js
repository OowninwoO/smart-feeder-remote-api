require("dotenv").config();

const mqtt = require("mqtt");
const pool = require("../db");
const admin = require("firebase-admin");

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

// deviceId로 알림 대상 FCM 토큰 조회
async function getFcmTokensByDeviceId(deviceId) {
  try {
    const { rows } = await pool.query(
      `
      select distinct ft.token
      from devices d
      join user_devices ud on ud.device_pk = d.id
      join fcm_tokens ft on ft.user_pk = ud.user_pk
      where d.device_id = $1
        and ft.is_enabled = true
      `,
      [deviceId]
    );

    return rows.map((r) => r.token).filter(Boolean);
  } catch (err) {
    console.error("[FCM] token query error:", err?.message ?? err);
    return [];
  }
}

// presence 상태를 FCM으로 전송
async function sendPresenceFcm({ deviceId, status }) {
  try {
    const tokens = await getFcmTokensByDeviceId(deviceId);
    if (tokens.length === 0) return;

    const statusText = status === "online" ? "온라인" : "오프라인";

    console.log(
      `[FCM] send presence: device=${deviceId}, status=${status}, tokens=${tokens.length}`
    );

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "급식기 상태",
        body: `기기(${deviceId})가 ${statusText} 상태입니다.`,
      },
      data: {
        notificationType: "FEEDER_PRESENCE",
        deviceId: String(deviceId),
        status,
      },
    });
  } catch (err) {
    console.error("[FCM] send error:", err?.message ?? err);
  }
}

// 기기 초기화를 FCM으로 전송
async function sendFactoryResetFcm({ deviceId }) {
  try {
    const tokens = await getFcmTokensByDeviceId(deviceId);
    if (tokens.length === 0) return;

    console.log(`[FCM] send reset: device=${deviceId}, tokens=${tokens.length}`);

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "급식기 설정",
        body: `기기(${deviceId})가 초기화되었습니다.`,
      },
      data: {
        notificationType: "FEEDER_RESET",
        deviceId: String(deviceId),
      },
    });
  } catch (err) {
    console.error("[FCM] send error:", err?.message ?? err);
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

  client.on("message", async (topic, payload) => {
    const message = payload ? payload.toString("utf8") : null;
    const parts = String(topic).split("/");
    const deviceId = parts[1];

    if (message && message.length > 0) {
      console.log(`mqtt received:${topic}/${message}`);
    } else {
      console.log(`mqtt received:${topic}`);
    }

    if (!deviceId) return;

    await insertMqttLog({
      deviceId,
      topic,
      payload: message && message.length > 0 ? message : null,
    });

    // 하나의 MQTT 메시지에 하나의 FCM만 처리
    // - factory_reset: 기기 초기화 알림 FCM 전송
    // - presence: 온라인/오프라인 상태 알림 FCM 전송
    switch (parts[2]) {
      case "factory_reset": {
        await sendFactoryResetFcm({ deviceId });
        break;
      }
      case "presence": {
        const status = message;
        if (status === "online" || status === "offline") {
          await sendPresenceFcm({ deviceId, status });
        }
        break;
      }
      default:
        break;
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
