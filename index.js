
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  AuditLogEvent
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================
// MAIN SYSTEM
// =====================================

const TOKEN = process.env.TOKEN;
const COLOR = 0xFFFFFF;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.User
  ]
});

// =====================================
// DATABASE
// =====================================

const folder = path.join(__dirname, "data");

if (!fs.existsSync(folder)) {
  fs.mkdirSync(folder, { recursive: true });
}

function readDB(name, fallback = {}) {
  const file = path.join(folder, name);

  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error("Database error:", error);
    return fallback;
  }
}

function saveDB(name, data) {
  fs.writeFileSync(
    path.join(folder, name),
    JSON.stringify(data, null, 2)
  );
}

let settings = readDB("settings.json");
let levels = readDB("levels.json");
let warnings = readDB("warnings.json");

function getSettings(guildId) {
  if (!settings[guildId]) {
    settings[guildId] = {};
  }

  const defaults = {
    logChannel: null,
    welcomeChannel: null,
    leaveChannel: null,
    welcomeMessage: "أهلًا {user} نورت سيرفر {server}!",
    leaveMessage: "{username} غادر السيرفر.",
    autoRole: null,
    levelRoles: [],
    activityRoles: [],
    aliases: {},
    trusted: [],
    antiNuke: true,
    antiSpam: true
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (settings[guildId][key] === undefined) {
      settings[guildId][key] = value;
    }
  }

  saveDB("settings.json", settings);

  return settings[guildId];
}

function getData(guildId, userId) {
  if (!levels[guildId]) levels[guildId] = {};

  if (!levels[guildId][userId]) {
    levels[guildId][userId] = {
      xp: 0,
      level: 0,
      messages: 0
    };
  }

  return levels[guildId][userId];
}

function requiredXP(level) {
  return 100 + level * 50;
}

// =====================================
// EMBEDS
// =====================================

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: "MAIN SYSTEM" });
}

// =====================================
// LOG
// =====================================

async function log(guild, title, description) {
  const config = getSettings(guild.id);

  if (!config.logChannel) return;

  const channel = guild.channels.cache.get(config.logChannel);

  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    embeds: [embed(title, description)]
  }).catch(() => {});
}

// =====================================
// ADMIN CHECK
// =====================================

function isAdmin(message) {
  return message.member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function mentionMember(message) {
  return message.mentions.members.first();
}

function mentionRole(message) {
  return message.mentions.roles.first();
}

// =====================================
// COMMAND NAMES
// =====================================

const commands = [
  "مساعدة",
  "توب",
  "رتبتي",
  "حظر",
  "طرد",
  "اسكات",
  "فكاسكات",
  "تحذير",
  "تحذيراته",
  "مسح",
  "عضو",
  "سيرفر",
  "صورة",
  "اعلان",
  "تغيير",
  "استرجاع",
  "لوق",
  "ترحيب",
  "مغادرة",
  "رسالة_ترحيب",
  "رسالة_مغادرة",
  "رتبة_تلقائية",
  "الغاء_رتبة_تلقائية",
  "اعطاء",
  "سحب",
  "رتبة_مستوى",
  "رتبة_تفاعل",
  "موثوق",
  "الغاء_موثوق"
];

function resolveCommand(input, config) {
  for (const original of commands) {
    if (config.aliases[original] === input) {
      return original;
    }
  }

  return commands.includes(input) ? input : null;
}

function commandName(original, config) {
  return config.aliases[original] || original;
}

// =====================================
// XP SYSTEM
// =====================================

const xpCooldown = new Map();
const spamMessages = new Map();

async function giveXP(message) {
  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();

  if (xpCooldown.has(key) && now - xpCooldown.get(key) < 60000) {
    return;
  }

  xpCooldown.set(key, now);

  const data = getData(message.guild.id, message.author.id);

  data.messages++;
  data.xp += Math.floor(Math.random() * 11) + 10;

  while (data.xp >= requiredXP(data.level)) {
    data.xp -= requiredXP(data.level);
    data.level++;

    await message.channel.send({
      embeds: [
        embed(
          "LEVEL UP!",
          `مبروك ${message.author}!\nوصلت إلى المستوى **${data.level}**`
        )
      ]
    }).catch(() => {});
  }

  await checkRoles(message.member);

  saveDB("levels.json", levels);
}

async function checkRoles(member) {
  const config = getSettings(member.guild.id);
  const data = getData(member.guild.id, member.id);

  for (const item of config.levelRoles) {
    if (data.level >= item.level) {
      const role = member.guild.roles.cache.get(item.role);

      if (role && role.editable && !member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => {});
      }
    }
  }

  for (const item of config.activityRoles) {
    if (data.messages >= item.messages) {
      const role = member.guild.roles.cache.get(item.role);

      if (role && role.editable && !member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => {});
      }
    }
  }
}

// =====================================
// ANTI SPAM
// =====================================

async function checkSpam(message) {
  const config = getSettings(message.guild.id);

  if (!config.antiSpam) return false;

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();

  const times = spamMessages.get(key) || [];
  const recent = times.filter(time => now - time < 5000);

  recent.push(now);
  spamMessages.set(key, recent);

  if (recent.length < 5) return false;

  spamMessages.delete(key);

  if (message.member.moderatable) {
    await message.member.timeout(
      60000,
      "MAIN SYSTEM - Anti Spam"
    ).catch(() => {});
  }

  await message.channel.send({
    embeds: [
      embed("ANTI SPAM", `تم رصد السبام من ${message.author}.`)
    ]
  }).catch(() => {});

  await log(
    message.guild,
    "حماية السبام",
    `تم رصد رسائل متكررة من ${message.author.tag}`
  );

  return true;
}

// =====================================
// WELCOME AND AUTO ROLE
// =====================================

client.on("guildMemberAdd", async member => {
  const config = getSettings(member.guild.id);

  // Welcome message
  if (config.welcomeChannel) {
    const channel = member.guild.channels.cache.get(
      config.welcomeChannel
    );

    if (channel && channel.isTextBased()) {
      const text = config.welcomeMessage
        .replaceAll("{user}", member.toString())
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{username}", member.user.username);

      await channel.send({
        embeds: [embed("WELCOME", text)]
      }).catch(() => {});
    }
  }

  // Automatic role for new members
  if (config.autoRole) {
    const role = member.guild.roles.cache.get(config.autoRole);

    if (role && role.editable) {
      await member.roles.add(role, "MAIN SYSTEM Auto Role")
        .then(() => {
          log(
            member.guild,
            "رتبة تلقائية",
            `تم إعطاء ${member.user.tag} الرتبة ${role.name}`
          );
        })
        .catch(error => {
          console.error("Auto Role Error:", error);
        });
    }
  }

  await log(
    member.guild,
    "دخول عضو",
    `${member.user.tag} دخل السيرفر.`
  );
});

// =====================================
// LEAVE
// =====================================

client.on("guildMemberRemove", async member => {
  const config = getSettings(member.guild.id);

  if (config.leaveChannel) {
    const channel = member.guild.channels.cache.get(
      config.leaveChannel
    );

    if (channel && channel.isTextBased()) {
      const text = config.leaveMessage
        .replaceAll("{username}", member.user.username)
        .replaceAll("{server}", member.guild.name);

      await channel.send({
        embeds: [embed("GOODBYE", text)]
      }).catch(() => {});
    }
  }

  await log(
    member.guild,
    "خروج عضو",
    `${member.user.tag} غادر السيرفر.`
  );
});

// =====================================
// MESSAGE LOGS
// =====================================

client.on("messageDelete", async message => {
  if (!message.guild) return;

  await log(
    message.guild,
    "حذف رسالة",
    `**العضو:** ${message.author?.tag || "غير معروف"}\n**الروم:** ${message.channel}\n**المحتوى:** ${message.content || "لا يوجد نص"}`
  );
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;

  if (oldMessage.partial) {
    await oldMessage.fetch().catch(() => {});
  }

  if (oldMessage.content === newMessage.content) return;

  await log(
    oldMessage.guild,
    "تعديل رسالة",
    `**العضو:** ${oldMessage.author?.tag || "غير معروف"}\n**الروم:** ${oldMessage.channel}\n**قبل:** ${oldMessage.content || "غير معروف"}\n**بعد:** ${newMessage.content || "غير معروف"}`
  );
});

// =====================================
// CHANNEL AND ROLE LOGS
// =====================================

client.on("channelCreate", channel => {
  if (channel.guild) {
    log(channel.guild, "إنشاء روم", `تم إنشاء **${channel.name}**`);
  }
});

client.on("channelDelete", channel => {
  if (channel.guild) {
    log(channel.guild, "حذف روم", `تم حذف **${channel.name}**`);
    checkNuke(channel.guild, AuditLogEvent.ChannelDelete, channel.id, "حذف روم");
  }
});

client.on("channelUpdate", (oldChannel, newChannel) => {
  if (newChannel.guild) {
    log(newChannel.guild, "تعديل روم", `تم تعديل **${oldChannel.name}**`);
  }
});

client.on("roleCreate", role => {
  log(role.guild, "إنشاء رتبة", `تم إنشاء **${role.name}**`);
});

client.on("roleDelete", role => {
  log(role.guild, "حذف رتبة", `تم حذف **${role.name}**`);
  checkNuke(role.guild, AuditLogEvent.RoleDelete, role.id, "حذف رتبة");
});

client.on("roleUpdate", (oldRole, newRole) => {
  log(newRole.guild, "تعديل رتبة", `تم تعديل **${oldRole.name}**`);
});

// =====================================
// ANTI NUKE
// =====================================

async function checkNuke(guild, type, targetId, action) {
  const config = getSettings(guild.id);

  if (!config.antiNuke) return;

  try {
    await new Promise(resolve => setTimeout(resolve, 1200));

    const logs = await guild.fetchAuditLogs({
      type,
      limit: 5
    });

    const entry = logs.entries.find(item =>
      item.target?.id === targetId &&
      Date.now() - item.createdTimestamp < 15000
    );

    if (!entry || !entry.executor) return;

    const executor = entry.executor;

    if (
      executor.id === client.user.id ||
      executor.id === guild.ownerId ||
      config.trusted.includes(executor.id)
    ) return;

    const member = await guild.members.fetch(executor.id).catch(() => null);

    if (!member) return;

    if (member.moderatable) {
      await member.timeout(
        10 * 60 * 1000,
        `MAIN SYSTEM Anti Nuke: ${action}`
      ).catch(() => {});
    }

    await log(
      guild,
      "ANTI NUKE",
      `تم رصد **${action}** بواسطة ${executor.tag}.\nتم تطبيق إجراء الحماية إن سمحت الصلاحيات.`
    );

  } catch (error) {
    console.error("Anti Nuke Error:", error);
  }
}

// =====================================
// MEMBER ROLE LOG
// =====================================

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const added = newMember.roles.cache.filter(
    role => !oldMember.roles.cache.has(role.id)
  );

  const removed = oldMember.roles.cache.filter(
    role => !newMember.roles.cache.has(role.id)
  );

  if (added.size) {
    await log(
      newMember.guild,
      "إضافة رتبة",
      `${newMember}\n${added.map(role => role.name).join("، ")}`
    );
  }

  if (removed.size) {
    await log(
      newMember.guild,
      "سحب رتبة",
      `${newMember}\n${removed.map(role => role.name).join("، ")}`
    );
  }
});

// =====================================
// COMMAND HANDLER
// =====================================

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  try {
    if (await checkSpam(message)) return;

    await giveXP(message);

    const config = getSettings(message.guild.id);
    const parts = message.content.trim().split(/\s+/);

    const input = parts.shift();
    const command = resolveCommand(input, config);

    if (!command) return;

    const args = parts;
    const target = mentionMember(message);

    const adminCommands = [
      "حظر", "طرد", "اسكات", "فكاسكات",
      "تحذير", "تحذيراته", "مسح", "اعلان",
      "تغيير", "استرجاع", "لوق", "ترحيب",
      "مغادرة", "رسالة_ترحيب", "رسالة_مغادرة",
      "رتبة_تلقائية", "الغاء_رتبة_تلقائية",
      "اعطاء", "سحب", "رتبة_مستوى",
      "رتبة_تفاعل", "موثوق", "الغاء_موثوق"
    ];

    if (adminCommands.includes(command) && !isAdmin(message)) {
      return message.reply("ليس لديك صلاحية Administrator.");
    }

    // HELP
    if (command === "مساعدة") {
      const list = commands.map(name =>
        `\`${commandName(name, config)}\``
      ).join(" • ");

      return message.reply({
        embeds: [embed("MAIN SYSTEM COMMANDS", list)]
      });
    }

    // TOP
    if (command === "توب") {
      const data = levels[message.guild.id] || {};

      const top = Object.entries(data)
        .sort((a, b) => {
          const scoreA = a[1].level * 100000 + a[1].xp;
          const scoreB = b[1].level * 100000 + b[1].xp;
          return scoreB - scoreA;
        })
        .slice(0, 10);

      if (!top.length) {
        return message.reply("لا توجد بيانات حتى الآن.");
      }

      const lines = [];

      for (let i = 0; i < top.length; i++) {
        const [id, info] = top[i];
        const user = await client.users.fetch(id).catch(() => null);

        lines.push(
          `**${i + 1}.** ${user ? user.username : id} — Level ${info.level} | XP ${info.xp}`
        );
      }

      return message.reply({
        embeds: [embed("TOP 10", lines.join("\n"))]
      });
    }

    // MY LEVEL
    if (command === "رتبتي") {
      const data = getData(message.guild.id, message.author.id);

      return message.reply({
        embeds: [
          embed(
            "رتبتك ومستواك",
            `**المستوى:** ${data.level}\n**XP:** ${data.xp}/${requiredXP(data.level)}\n**الرسائل:** ${data.messages}`
          )
        ]
      });
    }

    // CHANGE COMMAND NAME
    if (command === "تغيير") {
      const oldName = args[1] === "امر" ? args[2] : args[0];
      const newName = args[1] === "امر" ? args[3] : args[1];

      if (!oldName || !newName) {
        return message.reply("الاستخدام: تغيير امر توب متصدرين");
      }

      const original = commands.find(name =>
        name === oldName || config.aliases[name] === oldName
      );

      if (!original) {
        return message.reply("الأمر القديم غير موجود.");
      }

      if (
        commands.includes(newName) ||
        Object.values(config.aliases).includes(newName) ||
        newName.includes(" ")
      ) {
        return message.reply("الاسم الجديد مستخدم أو غير صالح.");
      }

      config.aliases[original] = newName;
      saveDB("settings.json", settings);

      await message.reply(
        `تم تغيير الأمر **${oldName}** إلى **${newName}** بنجاح.`
      );

      await log(
        message.guild,
        "تغيير اسم أمر",
        `${message.author.tag}: ${oldName} → ${newName}`
      );

      return;
    }

    // RESET COMMAND NAME
    if (command === "استرجاع") {
      const oldName = args[1] === "امر" ? args[2] : args[0];

      if (!oldName) {
        return message.reply("الاستخدام: استرجاع امر توب");
      }

      const original = commands.find(name =>
        name === oldName || config.aliases[name] === oldName
      );

      if (!original || !config.aliases[original]) {
        return message.reply("الأمر غير مغير أو غير موجود.");
      }

      delete config.aliases[original];
      saveDB("settings.json", settings);

      return message.reply(`تم استرجاع الأمر إلى **${original}**.`);
    }

    // LOG CHANNEL
    if (command === "لوق") {
      const channel = message.mentions.channels.first();

      if (!channel) return message.reply("حدد روم اللوق.");

      config.logChannel = channel.id;
      saveDB("settings.json", settings);

      return message.reply(`تم تحديد روم اللوق: ${channel}`);
    }

    // WELCOME CHANNEL
    if (command === "ترحيب") {
      const channel = message.mentions.channels.first();

      if (!channel) return message.reply("حدد روم الترحيب.");

      config.welcomeChannel = channel.id;
      saveDB("settings.json", settings);

      return message.reply(`تم تحديد روم الترحيب: ${channel}`);
    }

    // LEAVE CHANNEL
    if (command === "مغادرة") {
      const channel = message.mentions.channels.first();

      if (!channel) return message.reply("حدد روم المغادرة.");

      config.leaveChannel = channel.id;
      saveDB("settings.json", settings);

      return message.reply(`تم تحديد روم المغادرة: ${channel}`);
    }

    // WELCOME MESSAGE
    if (command === "رسالة_ترحيب") {
      const text = args.join(" ");

      if (!text) return message.reply("اكتب رسالة الترحيب.");

      config.welcomeMessage = text;
      saveDB("settings.json", settings);

      return message.reply("تم تغيير رسالة الترحيب.");
    }

    // LEAVE MESSAGE
    if (command === "رسالة_مغادرة") {
      const text = args.join(" ");

      if (!text) return message.reply("اكتب رسالة المغادرة.");

      config.leaveMessage = text;
      saveDB("settings.json", settings);

      return message.reply("تم تغيير رسالة المغادرة.");
    }

    // AUTO ROLE
    if (command === "رتبة_تلقائية") {
      const role = mentionRole(message);

      if (!role) {
        return message.reply("الاستخدام: رتبة_تلقائية @الرتبة");
      }

      if (!role.editable) {
        return message.reply(
          "لا أستطيع إعطاء هذه الرتبة. ارفع رتبة البوت فوقها."
        );
      }

      config.autoRole = role.id;
      saveDB("settings.json", settings);

      return message.reply(
        `تم تحديد الرتبة التلقائية: ${role}\nسيحصل عليها كل عضو جديد يدخل السيرفر.`
      );
    }

    // DISABLE AUTO ROLE
    if (command === "الغاء_رتبة_تلقائية") {
      if (!config.autoRole) {
        return message.reply("لا توجد رتبة تلقائية محددة.");
      }

      config.autoRole = null;
      saveDB("settings.json", settings);

      return message.reply("تم إلغاء الرتبة التلقائية.");
    }

    // GIVE ROLE
    if (command === "اعطاء") {
      const role = mentionRole(message);

      if (!target || !role) {
        return message.reply("الاستخدام: اعطاء @العضو @الرتبة");
      }

      if (!target.manageable || !role.editable) {
        return message.reply(
          "لا أستطيع إعطاء هذه الرتبة. تأكد من ترتيب الرتب وصلاحيات البوت."
        );
      }

      if (target.roles.cache.has(role.id)) {
        return message.reply("العضو يمتلك هذه الرتبة بالفعل.");
      }

      await target.roles.add(
        role,
        `MAIN SYSTEM بواسطة ${message.author.tag}`
      );

      await message.reply(`تم إعطاء ${target} الرتبة ${role}.`);

      await log(
        message.guild,
        "إعطاء رتبة",
        `**العضو:** ${target.user.tag}\n**الرتبة:** ${role.name}\n**بواسطة:** ${message.author.tag}`
      );

      return;
    }

    // REMOVE ROLE
    if (command === "سحب") {
      const role = mentionRole(message);

      if (!target || !role) {
        return message.reply("الاستخدام: سحب @العضو @الرتبة");
      }

      if (!target.manageable || !role.editable) {
        return message.reply(
          "لا أستطيع سحب هذه الرتبة. تأكد من ترتيب الرتب وصلاحيات البوت."
        );
      }

      if (!target.roles.cache.has(role.id)) {
        return message.reply("العضو لا يمتلك هذه الرتبة.");
      }

      await target.roles.remove(
        role,
        `MAIN SYSTEM بواسطة ${message.author.tag}`
      );

      await message.reply(`تم سحب الرتبة ${role} من ${target}.`);

      await log(
        message.guild,
        "سحب رتبة",
        `**العضو:** ${target.user.tag}\n**الرتبة:** ${role.name}\n**بواسطة:** ${message.author.tag}`
      );

      return;
    }

    // LEVEL ROLE
    if (command === "رتبة_مستوى") {
      const level = parseInt(args[0], 10);
      const role = mentionRole(message);

      if (!Number.isInteger(level) || level < 1 || !role) {
        return message.reply("الاستخدام: رتبة_مستوى 5 @رتبة");
      }

      if (!role.editable) {
        return message.reply("رتبة البوت يجب أن تكون أعلى من الرتبة المطلوبة.");
      }

      config.levelRoles = config.levelRoles.filter(
        item => item.level !== level
      );

      config.levelRoles.push({
        level,
        role: role.id
      });

      saveDB("settings.json", settings);

      return message.reply(
        `سيحصل العضو على ${role} عند الوصول للمستوى ${level}.`
      );
    }

    // ACTIVITY ROLE
    if (command === "رتبة_تفاعل") {
      const amount = parseInt(args[0], 10);
      const role = mentionRole(message);

      if (!Number.isInteger(amount) || amount < 1 || !role) {
        return message.reply("الاستخدام: رتبة_تفاعل 100 @رتبة");
      }

      if (!role.editable) {
        return message.reply("رتبة البوت يجب أن تكون أعلى من الرتبة المطلوبة.");
      }

      config.activityRoles = config.activityRoles.filter(
        item => item.messages !== amount
      );

      config.activityRoles.push({
        messages: amount,
        role: role.id
      });

      saveDB("settings.json", settings);

      return message.reply(
        `سيحصل العضو على ${role} بعد ${amount} رسالة.`
      );
    }

    // TRUSTED USERS
    if (command === "موثوق") {
      if (!target) return message.reply("حدد العضو.");

      if (!config.trusted.includes(target.id)) {
        config.trusted.push(target.id);
      }

      saveDB("settings.json", settings);

      return message.reply(`تم إضافة ${target} لقائمة الموثوقين.`);
    }

    if (command === "الغاء_موثوق") {
      if (!target) return message.reply("حدد العضو.");

      config.trusted = config.trusted.filter(
        id => id !== target.id
      );

      saveDB("settings.json", settings);

      return message.reply(`تم إزالة ${target} من قائمة الموثوقين.`);
    }

    // BAN
    if (command === "حظر") {
      if (!target) return message.reply("حدد العضو.");

      if (!target.bannable) {
        return message.reply("لا أستطيع حظر هذا العضو.");
      }

      const reason = args.filter(a => !a.startsWith("<@")).join(" ") || "MAIN SYSTEM";

      await target.ban({ reason });

      await message.reply(`تم حظر ${target.user.tag}.`);

      await log(
        message.guild,
        "حظر عضو",
        `${target.user.tag} بواسطة ${message.author.tag}\nالسبب: ${reason}`
      );

      return;
    }

    // KICK
    if (command === "طرد") {
      if (!target) return message.reply("حدد العضو.");

      if (!target.kickable) {
        return message.reply("لا أستطيع طرد هذا العضو.");
      }

      await target.kick("MAIN SYSTEM");

      await message.reply(`تم طرد ${target.user.tag}.`);

      await log(
        message.guild,
        "طرد عضو",
        `${target.user.tag} بواسطة ${message.author.tag}`
      );

      return;
    }

    // TIMEOUT
    if (command === "اسكات") {
      if (!target) return message.reply("حدد العضو.");

      const minutes = parseInt(args[1], 10) || 10;

      if (minutes < 1 || minutes > 40320) {
        return message.reply("المدة من 1 إلى 40320 دقيقة.");
      }

      if (!target.moderatable) {
        return message.reply("لا أستطيع إسكات هذا العضو.");
      }

      await target.timeout(minutes * 60000, "MAIN SYSTEM");

      await message.reply(
        `تم إسكات ${target} لمدة ${minutes} دقيقة.`
      );

      await log(
        message.guild,
        "إسكات عضو",
        `${target.user.tag} لمدة ${minutes} دقيقة.`
      );

      return;
    }

    // UNTIMEOUT
    if (command === "فكاسكات") {
      if (!target) return message.reply("حدد العضو.");

      if (!target.moderatable) {
        return message.reply("لا أستطيع فك الإسكات عن هذا العضو.");
      }

      await target.timeout(null);

      return message.reply(`تم فك الإسكات عن ${target}.`);
    }

    // WARN
    if (command === "تحذير") {
      if (!target) return message.reply("حدد العضو.");

      if (!warnings[message.guild.id]) {
        warnings[message.guild.id] = {};
      }

      if (!warnings[message.guild.id][target.id]) {
        warnings[message.guild.id][target.id] = [];
      }

      const reason = args.slice(1).join(" ") || "بدون سبب";

      warnings[message.guild.id][target.id].push({
        reason,
        moderator: message.author.tag,
        date: new Date().toISOString()
      });

      saveDB("warnings.json", warnings);

      await message.reply(`تم تحذير ${target}. السبب: ${reason}`);

      await log(
        message.guild,
        "تحذير عضو",
        `${target.user.tag}\nالسبب: ${reason}`
      );

      return;
    }

    // WARNINGS LIST
    if (command === "تحذيراته") {
      if (!target) return message.reply("حدد العضو.");

      const list = warnings[message.guild.id]?.[target.id] || [];

      if (!list.length) {
        return message.reply("لا توجد تحذيرات.");
      }

      const text = list.map((item, i) =>
        `${i + 1}. ${item.reason} — ${item.moderator}`
      ).join("\n");

      return message.reply({
        embeds: [embed("تحذيرات العضو", text)]
      });
    }

    // CLEAR MESSAGES
    if (command === "مسح") {
      const amount = parseInt(args[0], 10);

      if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
        return message.reply("اكتب عددًا من 1 إلى 100.");
      }

      const deleted = await message.channel.bulkDelete(amount, true);

      const reply = await message.channel.send(
        `تم حذف ${deleted.size} رسالة.`
      );

      setTimeout(() => reply.delete().catch(() => {}), 4000);

      await log(
        message.guild,
        "تنظيف رسائل",
        `${message.author.tag} حذف ${deleted.size} رسالة.`
      );

      return;
    }

    // MEMBER INFO
    if (command === "عضو") {
      const member = target || message.member;
      const data = getData(message.guild.id, member.id);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle("معلومات العضو")
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
              { name: "الاسم", value: member.user.tag },
              { name: "ID", value: member.id },
              { name: "المستوى", value: String(data.level), inline: true },
              { name: "XP", value: String(data.xp), inline: true },
              { name: "الرسائل", value: String(data.messages), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: "MAIN SYSTEM" })
        ]
      });
    }

    // SERVER INFO
    if (command === "سيرفر") {
      const guild = message.guild;

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL())
            .addFields(
              { name: "الأعضاء", value: String(guild.memberCount), inline: true },
              { name: "الرومات", value: String(guild.channels.cache.size), inline: true },
              { name: "الرتب", value: String(guild.roles.cache.size), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: "MAIN SYSTEM" })
        ]
      });
    }

    // AVATAR
    if (command === "صورة") {
      const user = target ? target.user : message.author;

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(`صورة ${user.username}`)
            .setImage(user.displayAvatarURL({
              size: 1024,
              extension: "png"
            }))
        ]
      });
    }

    // ANNOUNCEMENT
    if (command === "اعلان") {
      const text = args.join(" ");

      if (!text) return message.reply("اكتب نص الإعلان.");

      await message.channel.send({
        content: "@everyone",
        allowedMentions: { parse: ["everyone"] },
        embeds: [embed("إعلان الإدارة", text)]
      });

      await message.reply("تم إرسال الإعلان.");

      await log(
        message.guild,
        "إعلان جماعي",
        `بواسطة ${message.author.tag}`
      );

      return;
    }

  } catch (error) {
    console.error("COMMAND ERROR:", error);

    await message.reply(
      "حدث خطأ. تأكد من صلاحيات البوت وإعداداته."
    ).catch(() => {});
  }
});

// =====================================
// BOT READY
// =====================================

client.once("ready", () => {
  console.log("--------------------------------");
  console.log("MAIN SYSTEM ONLINE");
  console.log(`Bot: ${client.user.tag}`);
  console.log("--------------------------------");

  client.user.setPresence({
    activities: [
      { name: "MAIN SYSTEM | mian" }
    ],
    status: "online"
  });
});

// =====================================
// ERROR HANDLING
// =====================================

client.on("error", console.error);

process.on("unhandledRejection", error => {
  console.error("Unhandled Rejection:", error);
});

// =====================================
// LOGIN
// =====================================

if (!TOKEN) {
  console.error("TOKEN is missing!");
  process.exit(1);
}

client.login(TOKEN);
