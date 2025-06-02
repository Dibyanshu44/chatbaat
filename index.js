import express from "express";
import fs from "fs";
import bodyParser from "body-parser";
import { createServer } from "http";
import { Server } from "socket.io";

const port = 3000;
const app = express();
const server = createServer(app);
const io = new Server(server);

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
            var count = parts[0];
            var user = parts[1];
            var pass = parts[2];
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
    var user = req.body.username;
    var pass = req.body.password;
    var num = countlist.length;

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

        // Notify others about new user
        io.emit("newUser", user);

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
    var user1 = req.query.user;
    var user2 = req.params.id;
    var sortarr = [user1, user2].sort();
    var filename = sortarr[0] + "_" + sortarr[1] + ".txt";

    fs.readFile(filename, "utf-8", (err, data) => {
        if (err) {
            fs.writeFile(filename, "", (err) => {
                console.log("chat created successfully");
                var chatlist = [];
                res.render("chats.ejs", { user1: user1, user2: user2, chats: chatlist });
            });
        } else {
            var chatlist = data.trim().split("|");
            res.render("chats.ejs", { user1: user1, user2: user2, chats: chatlist });
        }
    });
});

app.post("/chat/:id", (req, res) => {
    var msg = req.body.msg;
    var user1 = req.query.user;
    var user2 = req.params.id;
    var j = req.query.j;
    var sortarr = [user1, user2].sort();
    var room = sortarr[0] + "_" + sortarr[1];

    fs.appendFile(room + ".txt", j + "`" + user1 + ": " + msg + "|", (err) => {
        if (err) throw err;
        console.log("saved successfully");

        // Emit to chat room with index j (as number)
        io.to(room).emit("message", {
            sender: user1,
            message: msg,
            index: Number(j)
        });

        res.redirect("/chat/" + user2 + "?user=" + user1);
    });
});

// Socket.IO logic
io.on("connection", function (socket) {
    console.log("A user connected");

    socket.on("joinRoom", function (roomName) {
        socket.join(roomName);
        console.log("User joined room:", roomName);
    });

    socket.on("disconnect", function () {
        console.log("A user disconnected");
    });
});

app.get("/logout", (req, res) => {
    res.redirect("/");
});

app.get("/home", (req, res) => {
    var user = req.query.user;

    if (!user || userlist.indexOf(user) === -1) {
        return res.redirect("/");
    }
    res.render("home.ejs", { code: user, users: userlist });
});

app.get("/dlt/:id", (req, res) => {
    const user2 = req.params.id;
    const user1 = req.query.user;
    const j = req.query.j;
    var sortarr = [user1, user2].sort();
    var room = sortarr[0] + "_" + sortarr[1];
    fs.readFile(room + ".txt", "utf8", (err, data) => {
        if (err) throw err;
        var lines = data.split("|");
        var count = 0;
        let newdata = "";
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].split("`");
            if (line.length < 2) continue;
            if (j !== line[0]) {
                newdata += count + "`" + line[1] + "|";
                count++;
            }
        }
        fs.writeFile(room + ".txt", newdata, (err) => {
            if (err) throw err;
            console.log("deleted successfully");
            res.redirect("/chat/" + user2 + "?user=" + user1);
        });
    });
});

app.get("/edit/:id", (req, res) => {
    const user1 = req.query.user;
    const user2 = req.params.id;
    const j = req.query.j;
    let existingdata = "";
    var sortarr = [user1, user2].sort();
    var room = sortarr[0] + "_" + sortarr[1];
    fs.readFile(room + ".txt", "utf8", (err, data) => {
        if (err) throw err;
        var lines = data.split("|");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].split("`");
            if (line.length < 2) continue;
            if (j === line[0]) {
                existingdata = line[1];
            }
        }
        res.render("edit.ejs", { j: j, content: existingdata, user1: user1, user2: user2 });
    });
});

app.post("/edit/:id", (req, res) => {
    const user1 = req.query.user;
    const user2 = req.params.id;
    const j = req.query.j;
    const updated = req.body.msg;
    var sortarr = [user1, user2].sort();
    var room = sortarr[0] + "_" + sortarr[1];

    fs.readFile(room + ".txt", "utf8", (err, data) => {
        if (err) throw err;
        var lines = data.split("|");
        let newdata = "";
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].split("`");
            if (line.length < 2) continue;
            if (line[0] === j) {
                newdata += i + "`" + user1 + ": " + updated + "|";
            } else {
                newdata += i + "`" + line[1] + "|";
            }
        }
        fs.writeFile(room + ".txt", newdata, (err) => {
            if (err) throw err;
            console.log("edited successfully");
            res.redirect("/chat/" + user2 + "?user=" + user1);
        });
    });
});

server.listen(port, () => {
    console.log("server running on port " + port);
});
