require("dotenv").config();

const express = require("express");

const devicesRoutes = require("./routes/devices");
const usersRoutes = require("./routes/users");

const app = express();

app.use(express.json());
app.use("/api/devices", devicesRoutes);
app.use("/api/users", usersRoutes);

const port = process.env.PORT;

app.listen(port, "0.0.0.0", () => {
  console.log(`smart_feeder_remote_api on http://0.0.0.0:${port}`);
});
