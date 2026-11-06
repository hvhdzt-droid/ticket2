const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  AuditLogEvent
} = require("discord.js");

const fs = require("fs");

// =============================
// MAIN SYSTEM CONFIG
// =============================

const TOKEN = process.env.TOKEN;

const PREFIX = ""; // بدون بادئة

const CONFIG = {
  name: "MAIN SYSTEM",
  color: 0x808080,

  // ضع آيدي روم اللوق
  logChannel: "PUT_LOG_CHANNEL_ID",

  // روم الترحيب والمغادرة
  welcomeChannel: "PUT_WELCOME_CHANNEL_ID",

  // رسالة الترحيب
  welcomeMessage: "أهلًا {user} نورت سيرفر {server}!",

  // رسالة المغادرة
  leaveMessage: "{username} غادر السيرفر.",

  // حماية السبام
  spamLimit: 5,
  spamTime: 5000,

  // حماية الرومات والرتب
  antiNuke: true,

  // الرتبة التلقائية عند الدخول
  autoRole: "PUT_ROLE_ID",

  // رتب المستويات: المستوى ثم آيدي الرتبة
  levelRoles: [
    { level: 5, role: "ROLE_ID_1" },
    { level: 10, role: "ROLE_ID_2" },
    { level: 20, role: "ROLE_ID_3" }
  ],

  // رتب التفاعل: عدد الرسائل ثم آيدي الرتبة
  activityRoles: [
    { messages: 100, role: "ROLE_ID_4" },
    { messages: 500, role: "ROLE_ID_5" }
  ],

  // الأشخاص المسموح لهم باستخدام الحماية
  trustedUsers: []
};

// =============================
// DATABASE
// =============================

if (!fs.existsSync("./data")) {
  fs.mkdirSync("./data");
}

function loadDB(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveDB(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let levels = loadDB("./data/levels.json");
let warnings = loadDB("./data/warnings.json");
let spam = new Map();

function getMemberData(memberId, guildId) {
  if (!levels[guildId]) levels[guildId] = {};

  if (!levels[guildId][memberId]) {
    levels[guildId][memberId] = {
      xp: 0,
      level: 0,
      messages: 0
    };
  }

  return levels[guildId][memberId];
}

// =============================
// CLIENT
// =============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.User
  ]
});

// =============================
// EMBED
// =============================

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(CONFIG.color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: "MAIN SYSTEM" });
}

// =============================
// LOG SYSTEM
// =============================

async function sendLog(guild, title, description) {
  try {
    const channel = guild.channels.cache.get(CONFIG.logChannel);

    if (!channel || !channel.isTextBased()) return;

    await channel.send({
      embeds: [makeEmbed(title, description)]
    });
  } catch (err) {
    console.log("Log Error:", err.message);
  }
}

// =============================
// LEVEL SYSTEM
// =============================

function requiredXP(level) {
  return 100 + level * 50;
}

async function giveLevelRoles(member, level, messages) {
  try {
    for (const item of CONFIG.levelRoles) {
      if (
        level >= item.level &&
        item.role &&
        !item.role.startsWith("ROLE_ID")
      ) {
        const role = member.guild.roles.cache.get(item.role);

        if (role && !member.roles.cache.has(role.id)) {
          await member.roles.add(role).catch(() => {});
        }
      }
    }

    for (const item of CONFIG.activityRoles) {
      if (
        messages >= item.messages &&
        item.role &&
        !item.role.startsWith("ROLE_ID")
      ) {
        const role = member.guild.roles.cache.get(item.role);

        if (role && !member.roles.cache.has(role.id)) {
          await member.roles.add(role).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.log("Role Error:", err.message);
  }
}

async function addXP(message) {
  const member = message.member;

  if (!member || member.user.bot) return;

  const data = getMemberData(member.id, message.guild.id);

  data.messages++;
  data.xp += Math.floor(Math.random() * 11) + 10;

  const needed = requiredXP(data.level);

  if (data.xp >= needed) {
    data.xp -= needed;
    data.level++;

    await message.channel.send({
      embeds: [
        makeEmbed(
          "LEVEL UP!",
          `مبروك ${member}!\nوصلت إلى المستوى **${data.level}**`
        )
      ]
    });

    await giveLevelRoles(member, data.level, data.messages);
  }

  await giveLevelRoles(member, data.level, data.messages);

  saveDB("./data/levels.json", levels);
}

// =============================
// WELCOME / LEAVE
// =============================

client.on("guildMemberAdd", async member => {
  try {
    const channel = member.guild.channels.cache.get(
      CONFIG.welcomeChannel
    );

    if (channel) {
      const text = CONFIG.welcomeMessage
        .replaceAll("{user}", member.toString())
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{username}", member.user.username);

      await channel.send({
        embeds: [makeEmbed("WELCOME", text)]
      });
    }

    if (
      CONFIG.autoRole &&
      !CONFIG.autoRole.startsWith("PUT_")
    ) {
      const role = member.guild.roles.cache.get(CONFIG.autoRole);

      if (role) await member.roles.add(role).catch(() => {});
    }

    await sendLog(
      member.guild,
      "دخول عضو",
      `${member} دخل السيرفر.`
    );
  } catch (err) {
    console.log(err);
  }
});

client.on("guildMemberRemove", async member => {
  const channel = member.guild.channels.cache.get(
    CONFIG.welcomeChannel
  );

  if (channel) {
    const text = CONFIG.leaveMessage
      .replaceAll("{username}", member.user.username)
      .replaceAll("{server}", member.guild.name);

    await channel.send({
      embeds: [makeEmbed("GOODBYE", text)]
    }).catch(() => {});
  }

  await sendLog(
    member.guild,
    "خروج عضو",
    `غادر ${member.user.tag} السيرفر.`
  );
});

// =============================
// MESSAGE EDIT / DELETE LOGS
// =============================

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    "حذف رسالة",
    `**العضو:** ${message.author || "غير معروف"}\n**الروم:** ${message.channel}\n**المحتوى:** ${message.content || "لا يوجد نص"}`
  );
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot) return;

  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    oldMessage.guild,
    "تعديل رسالة",
    `**العضو:** ${oldMessage.author}\n**الروم:** ${oldMessage.channel}\n**قبل:** ${oldMessage.content || "غير معروف"}\n**بعد:** ${newMessage.content || "غير معروف"}`
  );
});

// =============================
// ANTI SPAM
// =============================

async function antiSpam(message) {
  const id = message.author.id;

  if (!spam.has(id)) spam.set(id, []);

  const times = spam.get(id);

  const now = Date.now();

  times.push(now);

  const recent = times.filter(
    time => now - time < CONFIG.spamTime
  );

  spam.set(id, recent);

  if (recent.length >= CONFIG.spamLimit) {
    spam.set(id, []);

    await message.member.timeout(
      60 * 1000,
      "MAIN SYSTEM Anti Spam"
    ).catch(() => {});

    await message.channel.send({
      embeds: [
        makeEmbed(
          "ANTI SPAM",
          `${message.author} تم إسكاتك لمدة دقيقة بسبب السبام.`
        )
      ]
    });

    await sendLog(
      message.guild,
      "حماية السبام",
      `تم رصد سبام من ${message.author}`
    );

    return true;
  }

  return false;
}

// =============================
// ANTI NUKE
// =============================

async function checkAudit(guild, type, targetId, actionName) {
  if (!CONFIG.antiNuke) return;

  try {
    const logs = await guild.fetchAuditLogs({
      type,
      limit: 1
    });

    const entry = logs.entries.first();

    if (!entry || !entry.executor) return;

    if (Date.now() - entry.createdTimestamp > 10000) return;

    const executor = entry.executor;

    if (executor.id === client.user.id) return;

    if (CONFIG.trustedUsers.includes(executor.id)) return;

    if (executor.id === guild.ownerId) return;

    const member = await guild.members.fetch(executor.id).catch(() => null);

    if (!member) return;

    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }

    if (targetId && entry.target?.id !== targetId) return;

    await member.roles.set([]).catch(() => {});

    await member.timeout(
      60 * 60 * 1000,
      "MAIN SYSTEM Anti Nuke"
    ).catch(() => {});

    await sendLog(
      guild,
      "تحذير الحماية",
      `تم رصد عملية **${actionName}** بواسطة ${executor}.\nتم اتخاذ إجراء حماية على العضو.`
    );
  } catch (err) {
    console.log("AntiNuke:", err.message);
  }
}

client.on("channelDelete", async channel => {
  await sendLog(
    channel.guild,
    "حذف روم",
    `تم حذف روم: **${channel.name}**`
  );

  await checkAudit(
    channel.guild,
    AuditLogEvent.ChannelDelete,
    channel.id,
    "حذف روم"
  );
});

client.on("channelCreate", async channel => {
  await sendLog(
    channel.guild,
    "إنشاء روم",
    `تم إنشاء روم: **${channel.name}**`
  );

  await checkAudit(
    channel.guild,
    AuditLogEvent.ChannelCreate,
    channel.id,
    "إنشاء روم"
  );
});

client.on("roleDelete", async role => {
  await sendLog(
    role.guild,
    "حذف رتبة",
    `تم حذف رتبة: **${role.name}**`
  );

  await checkAudit(
    role.guild,
    AuditLogEvent.RoleDelete,
    role.id,
    "حذف رتبة"
  );
});

client.on("roleCreate", async role => {
  await sendLog(
    role.guild,
    "إنشاء رتبة",
    `تم إنشاء رتبة: **${role.name}**`
  );

  await checkAudit(
    role.guild,
    AuditLogEvent.RoleCreate,
    role.id,
    "إنشاء رتبة"
  );
});

// =============================
// ROLE / CHANNEL UPDATE LOG
// =============================

client.on("roleUpdate", async (oldRole, newRole) => {
  await sendLog(
    newRole.guild,
    "تعديل رتبة",
    `تم تعديل الرتبة **${oldRole.name}**`
  );
});

client.on("channelUpdate", async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  await sendLog(
    newChannel.guild,
    "تعديل روم",
    `تم تعديل الروم **${oldChannel.name}**`
  );
});

// =============================
// MEMBER ROLE LOG
// =============================

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const added = newMember.roles.cache.filter(
    role => !oldMember.roles.cache.has(role.id)
  );

  const removed = oldMember.roles.cache.filter(
    role => !newMember.roles.cache.has(role.id)
  );

  if (added.size) {
    await sendLog(
      newMember.guild,
      "إضافة رتبة",
      `${newMember}\nالرتب: ${added.map(r => r.name).join("، ")}`
    );
  }

  if (removed.size) {
    await sendLog(
      newMember.guild,
      "سحب رتبة",
      `${newMember}\nالرتب: ${removed.map(r => r.name).join("، ")}`
    );
  }
});

// =============================
// COMMAND PERMISSIONS
// =============================

function isAdmin(message) {
  return message.member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function getTarget(message) {
  return message.mentions.members.first();
}

function parseAmount(args, fallback = 1) {
  const number = parseInt(args[0], 10);
  return Number.isInteger(number) ? number : fallback;
}

// =============================
// MESSAGE COMMANDS
// =============================

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  try {
    if (await antiSpam(message)) return;

    await addXP(message);

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args.shift();

    // -------------------------
    // TOP
    // -------------------------

    if (command === "توب") {
      const data = levels[message.guild.id] || {};

      const top = Object.entries(data)
        .sort((a, b) => {
          const scoreA = a[1].level * 1000 + a[1].xp;
          const scoreB = b[1].level * 1000 + b[1].xp;
          return scoreB - scoreA;
        })
        .slice(0, 10);

      if (!top.length) {
        return message.reply("لا توجد بيانات مستويات حتى الآن.");
      }

      const list = await Promise.all(
        top.map(async ([id, info], index) => {
          const user = await client.users.fetch(id).catch(() => null);

          return `**${index + 1}.** ${user ? user.username : id} — Level **${info.level}** | XP **${info.xp}**`;
        })
      );

      return message.reply({
        embeds: [
          makeEmbed("TOP 10 MEMBERS", list.join("\n"))
        ]
      });
    }

    // -------------------------
    // MY LEVEL
    // -------------------------

    if (command === "رتبتي") {
      const data = getMemberData(
        message.author.id,
        message.guild.id
      );

      return message.reply({
        embeds: [
          makeEmbed(
            "مستواك",
            `**العضو:** ${message.author}\n**المستوى:** ${data.level}\n**XP:** ${data.xp}/${requiredXP(data.level)}\n**الرسائل:** ${data.messages}`
          )
        ]
      });
    }

    // -------------------------
    // HELP
    // -------------------------

    if (command === "مساعدة") {
      return message.reply({
        embeds: [
          makeEmbed(
            "MAIN SYSTEM COMMANDS",
            [
              "**المستويات**",
              "`توب`",
              "`رتبتي`",
              "",
              "**الإدارة**",
              "`حظر @العضو`",
              "`طرد @العضو`",
              "`اسكات @العضو 10`",
              "`فك اسكات @العضو`",
              "`تحذير @العضو السبب`",
              "`تحذيراته @العضو`",
              "`مسح 20`",
              "",
              "**معلومات**",
              "`عضو @العضو`",
              "`سيرفر`",
              "`صورة @العضو`",
              "",
              "**إضافية**",
              "`اعلان النص`"
            ].join("\n")
          )
        ]
      });
    }

    // -------------------------
    // BAN
    // -------------------------

    if (command === "حظر") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const target = getTarget(message);

      if (!target) return message.reply("حدد العضو.");

      if (!target.bannable) return message.reply("لا أستطيع حظر هذا العضو.");

      await target.ban({
        reason: args.slice(1).join(" ") || "MAIN SYSTEM"
      });

      await message.reply(`تم حظر ${target.user.tag}.`);

      await sendLog(
        message.guild,
        "حظر عضو",
        `العضو: ${target.user.tag}\nبواسطة: ${message.author.tag}`
      );
    }

    // -------------------------
    // KICK
    // -------------------------

    if (command === "طرد") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const target = getTarget(message);

      if (!target) return message.reply("حدد العضو.");

      if (!target.kickable) return message.reply("لا أستطيع طرد هذا العضو.");

      await target.kick(args.slice(1).join(" ") || "MAIN SYSTEM");

      await message.reply(`تم طرد ${target.user.tag}.`);

      await sendLog(
        message.guild,
        "طرد عضو",
        `${target.user.tag} بواسطة ${message.author.tag}`
      );
    }

    // -------------------------
    // TIMEOUT
    // -------------------------

    if (command === "اسكات") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const target = getTarget(message);

      if (!target) return message.reply("حدد العضو.");

      const minutes = parseAmount(args.slice(1), 10);

      if (minutes < 1 || minutes > 40320) {
        return message.reply("المدة يجب أن تكون من دقيقة إلى 40320 دقيقة.");
      }

      if (!target.moderatable) {
        return message.reply("لا أستطيع إسكات هذا العضو.");
      }

      await target.timeout(minutes * 60000, "MAIN SYSTEM");

      await message.reply(`تم إسكات ${target}. المدة: ${minutes} دقيقة.`);
    }

    // -------------------------
    // UNTIMEOUT
    // -------------------------

    if (command === "فك" && args[0] === "اسكات") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const target = getTarget(message);

      if (!target) return message.reply("حدد العضو.");

      await target.timeout(null);

      return message.reply(`تم فك الإسكات عن ${target}.`);
    }

    // -------------------------
    // WARN
    // -------------------------

    if (command === "تحذير") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const target = getTarget(message);

      if (!target) return message.reply("حدد العضو.");

      const reason = args.slice(1).join(" ") || "بدون سبب";

      if (!warnings[message.guild.id]) {
        warnings[message.guild.id] = {};
      }

      if (!warnings[message.guild.id][target.id]) {
        warnings[message.guild.id][target.id] = [];
      }

      warnings[message.guild.id][target.id].push({
        reason,
        moderator: message.author.tag,
        date: new Date().toISOString()
      });

      saveDB("./data/warnings.json", warnings);

      await message.reply(`تم تحذير ${target}. السبب: ${reason}`);

      await sendLog(
        message.guild,
        "تحذير عضو",
        `${target}\nالسبب: ${reason}\nبواسطة: ${message.author}`
      );
    }

    // -------------------------
    // WARNINGS
    // -------------------------

    if (command === "تحذيراته") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const target = getTarget(message);

      if (!target) return message.reply("حدد العضو.");

      const list = warnings[message.guild.id]?.[target.id] || [];

      if (!list.length) {
        return message.reply("هذا العضو ليس لديه تحذيرات.");
      }

      const text = list.map((w, i) =>
        `**${i + 1}.** ${w.reason} — ${w.moderator}`
      ).join("\n");

      return message.reply({
        embeds: [makeEmbed("تحذيرات العضو", text)]
      });
    }

    // -------------------------
    // CLEAR
    // -------------------------

    if (command === "مسح") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const amount = parseAmount(args, 1);

      if (amount < 1 || amount > 100) {
        return message.reply("حدد عددًا من 1 إلى 100.");
      }

      const deleted = await message.channel.bulkDelete(
        amount,
        true
      );

      const reply = await message.channel.send(
        `تم حذف ${deleted.size} رسالة.`
      );

      setTimeout(() => reply.delete().catch(() => {}), 4000);

      await sendLog(
        message.guild,
        "تنظيف الرسائل",
        `${message.author.tag} حذف ${deleted.size} رسالة.`
      );
    }

    // -------------------------
    // MEMBER INFO
    // -------------------------

    if (command === "عضو") {
      const target = getTarget(message) || message.member;

      const data = getMemberData(target.id, message.guild.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(CONFIG.color)
            .setTitle("معلومات العضو")
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
              { name: "الاسم", value: target.user.tag },
              { name: "المعرف", value: target.id },
              { name: "المستوى", value: String(data.level), inline: true },
              { name: "XP", value: String(data.xp), inline: true },
              { name: "الرسائل", value: String(data.messages), inline: true },
              {
                name: "تاريخ الانضمام",
                value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`
              }
            )
            .setFooter({ text: "MAIN SYSTEM" })
        ]
      });
    }

    // -------------------------
    // SERVER INFO
    // -------------------------

    if (command === "سيرفر") {
      const guild = message.guild;

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(CONFIG.color)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL())
            .addFields(
              { name: "الأعضاء", value: String(guild.memberCount), inline: true },
              { name: "الرومات", value: String(guild.channels.cache.size), inline: true },
              { name: "الرتب", value: String(guild.roles.cache.size), inline: true },
              {
                name: "تاريخ الإنشاء",
                value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`
              }
            )
            .setFooter({ text: "MAIN SYSTEM" })
        ]
      });
    }

    // -------------------------
    // AVATAR
    // -------------------------

    if (command === "صورة") {
      const target = getTarget(message);

      const user = target ? target.user : message.author;

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(CONFIG.color)
            .setTitle(`صورة ${user.username}`)
            .setImage(user.displayAvatarURL({
              size: 1024,
              extension: "png"
            }))
        ]
      });
    }

    // -------------------------
    // ANNOUNCEMENT
    // -------------------------

    if (command === "اعلان") {
      if (!isAdmin(message)) return message.reply("ليس لديك صلاحية.");

      const announcement = args.join(" ");

      if (!announcement) return message.reply("اكتب نص الإعلان.");

      await message.channel.send({
        content: "@everyone",
        allowedMentions: { parse: ["everyone"] },
        embeds: [
          makeEmbed("إعلان الإدارة", announcement)
        ]
      });

      await message.reply("تم إرسال الإعلان.");
    }

  } catch (error) {
    console.error("Command Error:", error);

    await message.reply(
      "حدث خطأ أثناء تنفيذ الأمر. تأكد من صلاحيات البوت."
    ).catch(() => {});
  }
});

// =============================
// READY
// =============================

client.once("ready", () => {
  console.log("================================");
  console.log("MAIN SYSTEM IS ONLINE");
  console.log(`Logged in as ${client.user.tag}`);
  console.log("================================");

  client.user.setPresence({
    activities: [
      { name: "MAIN SYSTEM | mian" }
    ],
    status: "online"
  });
});

// =============================
// ERROR HANDLING
// =============================

client.on("error", error => {
  console.error("Discord Error:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled Rejection:", error);
});

// =============================
// LOGIN
// =============================

if (!TOKEN) {
  console.error("ERROR: TOKEN is missing!");
  process.exit(1);
}

client.login(TOKEN);

client.login(TOKEN).catch(error => {
  console.error('فشل تسجيل الدخول:', error.message);
  process.exit(1);
});
