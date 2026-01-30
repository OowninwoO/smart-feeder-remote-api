const express = require("express");
const db = require("../db");
const { firebaseAuthMiddleware } = require("../middlewares/firebase_auth_middleware");

const router = express.Router();

router.get("/logs", firebaseAuthMiddleware, async (req, res) => {
  const client = await db.connect();

  try {
    const limit = 20;

    const cursorAtRaw = req.query.cursorAt;
    const cursorIdRaw = req.query.cursorId;

    const params = [req.userPk];
    let cursorWhere = "";

    // cursorAt/cursorId를 Date/int로 변환
    if (cursorAtRaw && cursorIdRaw) {
      const cursorAt = new Date(cursorAtRaw);
      const cursorId = parseInt(cursorIdRaw, 10);

      params.push(cursorAt.toISOString());
      params.push(cursorId);

      // 마지막으로 받은 (received_at, id)보다 "더 과거"만 조회
      cursorWhere = `
        and (
          ml.received_at < $2
          or (ml.received_at = $2 and ml.id < $3)
        )
      `;
    }

    // limit+1로 더 있는지(hasMore) 판별
    params.push(limit + 1);
    const limitParamIndex = params.length;

    const result = await client.query(
      `
      select
        ml.id,
        ml.received_at as "receivedAt",
        ml.device_id as "deviceId",
        ml.topic,
        ml.payload
      from mqtt_logs ml
      join devices d
        on d.device_id = ml.device_id
      join user_devices ud
        on ud.device_pk = d.id
      where ud.user_pk = $1
      ${cursorWhere}
      order by ml.received_at desc, ml.id desc
      limit $${limitParamIndex};
      `,
      params
    );

    const rows = result.rows;

    // 21개면 20개만 내려주고 hasMore=true
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // 다음 요청에 사용할 커서(마지막 item 기준)
    const last = items.length > 0 ? items[items.length - 1] : null;

    return res.json({
      success: true,
      message: "MQTT 로그 조회에 성공했습니다.",
      data: {
        cursorAt: last ? last.receivedAt : null,
        cursorId: last ? last.id : null,
        hasMore,
        items,
      },
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
