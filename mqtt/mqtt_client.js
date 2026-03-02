require("dotenv").config();

const mqtt = require("mqtt");
const db = require("../db");
const admin = require("firebase-admin");

// mqtt 메시지 로그를 DB에 저장하고, 생성된 로그 1건을 반환(FCM data로 전달용)
async function insertMqttLog({ deviceId, topic, payload }) {
  const client = await db.connect();

  try {
    const { rows } = await client.query(
      `
      insert into mqtt_logs (device_id, topic, payload)
      values ($1, $2, $3)
      returning id, received_at, device_id, topic, payload
      `,
      [deviceId, topic, payload]
    );

    return rows[0];
  } catch (err) {
    console.error("[MQTT] log insert error:", err?.message ?? err);
  } finally {
    client.release();
  }
}

// deviceId로 알림 대상 FCM 토큰 조회
async function getFcmTokensByDeviceId(deviceId) {
  const client = await db.connect();

  try {
    const { rows } = await client.query(
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
  } finally {
    client.release();
  }
}

// mqtt_logs row를 FCM data로 전달 가능한 형태로 변환(FCM data는 문자열만 허용)
function buildMqttLogData(mqttLog) {
  return {
    id: String(mqttLog.id),
    receivedAt: new Date(mqttLog.received_at).toISOString(),
    deviceId: String(mqttLog.device_id),
    topic: String(mqttLog.topic),
    payload: mqttLog.payload == null ? "" : String(mqttLog.payload),
  };
}

// presence 상태를 FCM으로 전송
async function sendPresenceFcm({ deviceId, status, mqttLog }) {
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
        ...buildMqttLogData(mqttLog),
      },
    });
  } catch (err) {
    console.error("[FCM] send error:", err?.message ?? err);
  }
}

// 기기 초기화를 FCM으로 전송
async function sendFactoryResetFcm({ deviceId, mqttLog }) {
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
        ...buildMqttLogData(mqttLog),
      },
    });
  } catch (err) {
    console.error("[FCM] send error:", err?.message ?? err);
  }
}

/// Flutter 로그 갱신용
/// notification 없이(data-only) FCM 전송
async function sendMqttLogDataOnlyFcm({ deviceId, mqttLog }) {
  try {
    const tokens = await getFcmTokensByDeviceId(deviceId);
    if (tokens.length === 0) return;

    await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        notificationType: "MQTT_LOG",
        ...buildMqttLogData(mqttLog),
      },
    });
  } catch (err) {
    console.error("[FCM] send data-only error:", err?.message ?? err);
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

    const mqttLog = await insertMqttLog({
      deviceId,
      topic,
      payload: message && message.length > 0 ? message : null,
    });

    if (!mqttLog) return;

    // 하나의 MQTT 메시지에 하나의 FCM만 처리
    // - factory_reset: 기기 초기화 알림 FCM 전송
    // - presence: 온라인/오프라인 상태 알림 FCM 전송
    switch (parts[2]) {
      case "factory_reset": {
        await sendFactoryResetFcm({ deviceId, mqttLog });
        break;
      }
      case "presence": {
        const status = message;
        if (status === "online" || status === "offline") {
          await sendPresenceFcm({ deviceId, status, mqttLog });
        }
        break;
      }
      // presence / factory_reset 외 모든 로그는 data-only 전송
      default: {
        await sendMqttLogDataOnlyFcm({ deviceId, mqttLog });
        break;
      }
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