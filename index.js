const express = require('express');
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder
} = require('discord.js');

const app = express();
app.get('/', (_req, res) => res.send('Rase Tickets Online'));
app.listen(process.env.PORT || 10000, '0.0.0.0');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || '';
const CATEGORY_ID = process.env.TICKET_CATEGORY_ID || '';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('أضف TOKEN وCLIENT_ID وGUILD_ID في Render.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const types = {
  role: 'طلب رول',
  complaint: 'شكوى',
  admin: 'طلب ادمن',
  question: 'استفسار'
};

const command = new SlashCommandBuilder()
  .setName('setup-ticket')
  .setDescription('إرسال لوحة التكت')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addAttachmentOption(option =>
    option
      .setName('image')
      .setDescription('ارفق صورة لوحة التكت (اختياري)')
      .setRequired(false)
  );

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: [command.toJSON()] }
  );
  console.log('تم تسجيل أمر /setup-ticket.');
}

function panelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rase_menu')
      .setPlaceholder('🎫 اختر نوع التذكرة')
      .addOptions(
        { label: 'طلب رول', value: 'role', emoji: '🛡️' },
        { label: 'شكوى', value: 'complaint', emoji: '📢' },
        { label: 'طلب ادمن', value: 'admin', emoji: '👮' },
        { label: 'استفسار', value: 'question', emoji: '❓' }
      )
  );
}

function closeButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rase_close')
      .setLabel('إغلاق التذكرة')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function staffCheck(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID));
}

client.once('ready', async () => {
  console.log(`البوت متصل: ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error('فشل تسجيل الأوامر:', error);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'setup-ticket') return;

      if (!interaction.memberPermissions.has(
        PermissionFlagsBits.Administrator
      )) {
        return interaction.reply({
          content: 'هذا الأمر للمدير فقط.',
          ephemeral: true
        });
      }

      const image = interaction.options.getAttachment('image');
      const embed = new EmbedBuilder()
        .setColor(0x4b0d1a)
        .setTitle('🎫 نظام التذاكر')
        .setDescription(
          'أهلًا بك!\nاختر نوع التذكرة من القائمة أدناه.\n' +
          'سيتم فتح روم خاص لك وللإدارة.'
        )
        .addFields(
          { name: '🛡️ طلب رول', value: 'طلب رتبة', inline: true },
          { name: '📢 شكوى', value: 'تقديم شكوى', inline: true },
          { name: '👮 طلب ادمن', value: 'مساعدة الإدارة', inline: true },
          { name: '❓ استفسار', value: 'أي سؤال', inline: true }
        )
        .setFooter({ text: 'Rase Tickets' })
        .setTimestamp();

      const files = [];

      if (image) {
        if (!image.contentType?.startsWith('image/')) {
          return interaction.reply({
            content: 'المرفق لازم يكون صورة.',
            ephemeral: true
          });
        }

        if (image.size > 8 * 1024 * 1024) {
          return interaction.reply({
            content: 'حجم الصورة يجب أن يكون أقل من 8 ميغابايت.',
            ephemeral: true
          });
        }

        const response = await fetch(image.url);
        if (!response.ok) throw new Error('تعذر تحميل الصورة.');

        const buffer = Buffer.from(await response.arrayBuffer());
        embed.setImage('attachment://panel-image.png');
        files.push(new AttachmentBuilder(buffer, {
          name: 'panel-image.png'
        }));
      }

      await interaction.channel.send({
        embeds: [embed],
        components: [panelMenu()],
        files
      });

      return interaction.reply({
        content: 'تم إرسال لوحة التكت بنجاح.',
        ephemeral: true
      });
    }

    if (interaction.isStringSelectMenu() &&
        interaction.customId === 'rase_menu') {
      await interaction.deferReply({ ephemeral: true });

      const type = interaction.values[0];
      if (!types[type]) {
        return interaction.editReply('نوع التكت غير معروف.');
      }

      const guild = interaction.guild;
      const user = interaction.user;

      const existing = guild.channels.cache.find(ch =>
        ch.type === ChannelType.GuildText &&
        ch.topic?.includes(`owner=${user.id};`) &&
        !ch.topic.includes(';closed=true')
      );

      if (existing) {
        return interaction.editReply(`عندك تكت مفتوح بالفعل: ${existing}`);
      }

      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ];

      if (STAFF_ROLE_ID && guild.roles.cache.has(STAFF_ROLE_ID)) {
        overwrites.push({
          id: STAFF_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }

      const options = {
        name: `ticket-${user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '')
          .slice(0, 90) || `ticket-${user.id}`,
        type: ChannelType.GuildText,
        topic: `owner=${user.id};type=${type}`,
        permissionOverwrites: overwrites
      };

      if (CATEGORY_ID) {
        const category = guild.channels.cache.get(CATEGORY_ID);
        if (category?.type === ChannelType.GuildCategory) {
          options.parent = category.id;
        }
      }

      const channel = await guild.channels.create(options);

      const ticketEmbed = new EmbedBuilder()
        .setColor(0x4b0d1a)
        .setTitle(`🎫 ${types[type]}`)
        .setDescription(
          `أهلًا ${user}!\nتم فتح تذكرتك.\n` +
          'اكتب تفاصيل طلبك وانتظر رد الإدارة.'
        )
        .setTimestamp();

      await channel.send({
        content: STAFF_ROLE_ID ? `<@&${STAFF_ROLE_ID}>` : `${user}`,
        embeds: [ticketEmbed],
        components: [closeButton()],
        allowedMentions: {
          users: STAFF_ROLE_ID ? [] : [user.id],
          roles: STAFF_ROLE_ID ? [STAFF_ROLE_ID] : []
        }
      });

      return interaction.editReply(`تم فتح تذكرتك: ${channel}`);
    }

    if (interaction.isButton() &&
        interaction.customId === 'rase_close') {
      const channel = interaction.channel;
      const match = channel.topic?.match(/owner=(\d+);/);
      const ownerId = match?.[1];

      if (!ownerId) {
        return interaction.reply({
          content: 'لم أستطع تحديد صاحب التكت.',
          ephemeral: true
        });
      }

      if (interaction.user.id !== ownerId &&
          !staffCheck(interaction.member)) {
        return interaction.reply({
          content: 'فقط صاحب التكت أو الإدارة يستطيع إغلاقه.',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      await channel.permissionOverwrites.edit(ownerId, {
        ViewChannel: false,
        SendMessages: false
      });

      await channel.setTopic(`${channel.topic};closed=true`);
      await channel.setName(`closed-${channel.name}`.slice(0, 100));

      await interaction.editReply('🔒 تم إغلاق التكت.');

      await interaction.message.edit({
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rase_closed')
              .setLabel('تم الإغلاق')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          )
        ]
      });
    }
  } catch (error) {
    console.error('خطأ:', error);

    const reply = {
      content: 'حدث خطأ. راجع سجلات Render لمعرفة السبب.',
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.login(TOKEN).catch(error => {
  console.error('فشل تسجيل الدخول:', error.message);
  process.exit(1);
});
