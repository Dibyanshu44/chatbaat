import express from "express";
import fs from "fs";
import bodyParser from "body-parser";
import { createServer } from "http";
import { Server } from "socket.io";

const port = 3000;
const app = express();
const server = createServer(app);
const io = new Server(server);

let userlist = [];
let passlist = [];
let countlist = [];

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

fs.readFile("info.txt", "utf-8", (err, data) => {
  if (err) throw err;
  const lines = data.trim().split("\n");
  for (const line of lines) {
    const [count, user, pass] = line.trim().split("|");
    if (user && pass) {
      userlist.push(user.trim());
      passlist.push(pass.trim());
      countlist.push(count.trim());
    }
  }
});

app.get("/", (req, res) => {
  res.render("index.ejs", { code: "signup", note: null });
});

app.post("/signup", (req, res) => {
  const user = req.body.username;
  const pass = req.body.password;

  if (userlist.includes(user)) {
    return res.render("index.ejs", { code: "signup", note: "Username already exists" });
  }

  const num = countlist.length;
  fs.appendFile("info.txt", `${num}|${user}|${pass}\n`, (err) => {
    if (err) throw err;
    userlist.push(user);
    passlist.push(pass);
    countlist.push(num);
    io.emit("newUser", user);
    res.render("home.ejs", { code: user, users: userlist });
  });
});

app.get("/login", (req, res) => {
  res.render("index.ejs", { code: "login", note: null });
});

app.post("/login", (req, res) => {
  const user = req.body.username;
  const pass = req.body.password;
  const index = userlist.indexOf(user);

  if (index === -1) {
    return res.render("index.ejs", { code: "login", note: "Username not found" });
  }

  if (passlist[index] !== pass) {
    return res.render("index.ejs", { code: "login", note: "Incorrect password!" });
  }

  res.render("home.ejs", { code: user, users: userlist });
});

app.get("/chat/:id", (req, res) => {
  const user1 = req.query.user;
  const user2 = req.params.id;
  if (!user1 || !userlist.includes(user1)) return res.redirect("/");

  const room = [user1, user2].sort().join("_");
  fs.readFile(`${room}.txt`, "utf-8", (err, data) => {
    if (err) {
      fs.writeFile(`${room}.txt`, "", () => {
        res.render("chats.ejs", { user1, user2, chats: [] });
      });
    } else {
      const chatlist = data.trim().split("|").filter(line => line);
      res.render("chats.ejs", { user1, user2, chats: chatlist });
    }
  });
});

app.post("/chat/:id", (req, res) => {
  const msg = req.body.msg;
  const user1 = req.query.user;
  const user2 = req.params.id;
  const j = req.query.j;
  const room = [user1, user2].sort().join("_");

  fs.appendFile(`${room}.txt`, `${j}\`${user1}: ${msg}|`, (err) => {
    if (err) throw err;
    io.to(room).emit("message", { sender: user1, message: msg, index: Number(j) });
    res.redirect(`/chat/${user2}?user=${user1}`);
  });
});

app.get("/edit/:id", (req, res) => {
  const user1 = req.query.user;
  const user2 = req.params.id;
  const j = req.query.j;
  const room = [user1, user2].sort().join("_");
  fs.readFile(`${room}.txt`, "utf-8", (err, data) => {
    if (err) return res.status(500).send("Could not read file");
    const lines = data.split("|");
    let found = "";
    for (const line of lines) {
      const [index, content] = line.split("`");
      if (index === j) {
        const sep = content.indexOf(": ");
        const sender = content.slice(0, sep);
        if (sender === user1) {
          found = content;
        }
      }
    }
    if (found === "") return res.status(403).send("Cannot edit other's message");
    res.render("edit.ejs", { j, content: found, user1, user2 });
  });
});

app.post("/edit/:id", (req, res) => {
  const user1 = req.query.user;
  const user2 = req.params.id;
  const j = req.query.j;
  const newMsg = req.body.msg;
  const room = [user1, user2].sort().join("_");

  fs.readFile(`${room}.txt`, "utf-8", (err, data) => {
    if (err) return res.status(500).send("Could not read file");
    const lines = data.split("|");
    let newdata = "";
    for (const line of lines) {
      if (!line) continue;
      const [index, content] = line.split("`");
      const sep = content.indexOf(": ");
      const sender = content.slice(0, sep);
      if (index === j && sender === user1) {
        newdata += `${j}\`${user1}: ${newMsg}|`;
        io.to(room).emit("editMessage", { index: Number(j), sender: user1, message: newMsg });
      } else {
        newdata += `${index}\`${content}|`;
      }
    }
    fs.writeFile(`${room}.txt`, newdata, (err) => {
      if (err) throw err;
      res.redirect(`/chat/${user2}?user=${user1}`);
    });
  });
});

app.get("/dlt/:id", (req, res) => {
  const user1 = req.query.user;
  const user2 = req.params.id;
  const j = req.query.j;
  const room = [user1, user2].sort().join("_");

  fs.readFile(`${room}.txt`, "utf-8", (err, data) => {
    if (err) throw err;
    const lines = data.split("|").filter(Boolean);
    let newdata = "";
    let count = 0;
    for (const line of lines) {
      const [index, content] = line.split("`");
      const sep = content.indexOf(": ");
      const sender = content.slice(0, sep);
      if (index !== j || sender !== user1) {
        newdata += `${count}\`${content}|`;
        count++;
      }
    }
    fs.writeFile(`${room}.txt`, newdata, (err) => {
      if (err) throw err;
      res.redirect(`/chat/${user2}?user=${user1}`);
    });
  });
});

app.get("/logout", (req, res) => {
  res.redirect("/");
});

app.get("/home", (req, res) => {
  const user = req.query.user;
  if (!user || !userlist.includes(user)) return res.redirect("/");
  res.render("home.ejs", { code: user, users: userlist });
});

io.on("connection", (socket) => {
  socket.on("joinRoom", (room) => {
    socket.join(room);
  });
});

server.listen(port, () => {
  console.log("Server running on port " + port);
});