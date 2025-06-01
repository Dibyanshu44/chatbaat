import express from "express";
import fs from "fs";
import bodyParser from "body-parser";
import { createServer } from "http";
import { Server } from "socket.io";

const port = 3000;
const app = express();
const server = createServer(app);
const io = new Server(server); // Socket.IO setup

var userlist = [];
var passlist = [];
var countlist = [];

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

fs.readFile("info.txt", "utf-8", (err, data) => {
    if (err) throw err;
    var lines = data.trim().split("\n");
    for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].trim().split("|");
        if (parts.length > 2) {
            var [count, user, pass] = parts;
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
    const num = countlist.length;
    for (var i = 0; i < userlist.length; i++) {
        if (user === userlist[i]) {
            return res.render("index.ejs", { code: "signup", note: "Username already exists" });
        }
    }
    fs.appendFile("info.txt", num + "|" + user + "|" + pass + "\n", (err) => {
        if (err) throw err;
        userlist.push(user);
        passlist.push(pass);
        countlist.push(num);
        console.log("saved successfully");
        res.render("home.ejs", { code: user, users: userlist });
    });
});

app.get("/login", (req, res) => {
    res.render("index.ejs", { code: "login", note: null });
});

app.post("/login", (req, res) => {
    var user = req.body.username;
    var pass = req.body.password;
    for (var i = 0; i < userlist.length; i++) {
        if (user === userlist[i]) {
            if (pass === passlist[i]) {
                return res.render("home.ejs", { code: user, users: userlist });
            } else {
                return res.render("index.ejs", { code: "login", note: "Incorrect password!" });
            }
        }
    }
    res.render("index.ejs", { code: "login", note: "Username not found" });
});

app.get("/chat/:id", (req, res) => {
    const user1 = req.query.user;
    const user2 = req.params.id;
    const sortarr = [user1, user2].sort();
    fs.readFile(sortarr[0] + "_" + sortarr[1] + ".txt", "utf-8", (err, data) => {
        if (err) {
            fs.writeFile(sortarr[0] + "_" + sortarr[1] + ".txt", "", (err) => {
                console.log("chat created successfully");
                var chatlist = [];
                res.render("chats.ejs", { user1: req.query.user, user2: req.params.id, chats: chatlist });
            });
        } else {
            var chatlist = data.trim().split("|");
            res.render("chats.ejs", { user1: req.query.user, user2: req.params.id, chats: chatlist });
        }
    });
});

app.post("/chat/:id", (req, res) => {
    var msg = req.body.msg;
    const user1 = req.query.user;
    const user2 = req.params.id;
    const sortarr = [user1, user2].sort();
    fs.appendFile(sortarr[0] + "_" + sortarr[1] + ".txt", user1 + ": " + msg + "|", (err) => {
        if (err) throw err;
        console.log("saved successfully");

        // Emit message in real-time
        io.to(sortarr[0] + "_" + sortarr[1]).emit("message", {
            sender: user1,
            message: msg
        });

        res.redirect(`/chat/${user2}?user=${user1}`);
    });
});

// Socket.IO logic
io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("joinRoom", (roomName) => {
        socket.join(roomName);
        console.log("User joined room:", roomName);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

app.get("/logout", (req, res) => {
    res.redirect("/");
});

app.get("/home", (req, res) => {
    const user = req.query.user;
    if (!user || !userlist.includes(user)) {
        return res.redirect("/");
    }
    res.render("home.ejs", { code: user, users: userlist });
});


server.listen(port, () => {
    console.log("server running on port " + port);
});
