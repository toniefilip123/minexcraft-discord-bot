const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AuditLogEvent,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

const config = require("./config");

// =====================================================
// HTTP SERVER - WYMAGANY PRZEZ RENDER
// =====================================================

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Bot Discord działa!");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log("Serwer HTTP działa na porcie " + PORT);
  });

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],

  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

// =====================================================
// PLIKI BACKUPU
// =====================================================

const BACKUP_FILE = path.join(__dirname, "backup.json");

// =====================================================
// SPAM
// =====================================================

const spamCounter = new Map();

// =====================================================
// WERYFIKACJA
// =====================================================

const verificationQuestions = new Map();

// =====================================================
// POMOCNICZE
// =====================================================

function isConfigured(value) {
  return value && !String(value).startsWith("WSTAW_");
}

function isOwner(interaction) {
  if (!interaction.guild) return false;

  return (
    interaction.user.id === config.OWNER_ID &&
    interaction.guild.ownerId === interaction.user.id
  );
}

function getLogChannel(guild) {
  if (!guild) return null;

  if (!isConfigured(config.LOG_CHANNEL_ID)) {
    return null;
  }

  return guild.channels.cache.get(config.LOG_CHANNEL_ID) || null;
}

async function sendLog(guild, title, description, color = config.EMBED_COLOR) {
  try {
    const channel = getLogChannel(guild);

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    await channel.send({
      embeds: [embed]
    });
  } catch (error) {
    console.log("Nie udało się wysłać loga:", error.message);
  }
}

function getTicketStaffRoles() {
  return [
    config.CEO_ROLE_ID,
    config.ADMIN_ROLE_ID,
    config.MODERATOR_ROLE_ID,
    config.POMOCNIK_ROLE_ID,
    config.HADMIN_ROLE_ID
  ].filter(isConfigured);
}

function memberCanManageTicket(member) {
  if (!member) return false;

  return getTicketStaffRoles().some(roleId =>
    member.roles.cache.has(roleId)
  );
}

// =====================================================
// BACKUP
// =====================================================

async function createBackup(guild) {
  const backup = {
    guildId: guild.id,
    guildName: guild.name,
    createdAt: new Date().toISOString(),
    channels: []
  };

  const channels = [...guild.channels.cache.values()]
    .sort((a, b) => a.rawPosition - b.rawPosition);

  for (const channel of channels) {
    const data = {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId || null,
      position: channel.rawPosition,
      topic: channel.topic || null,
      nsfw: channel.nsfw || false,
      rateLimitPerUser: channel.rateLimitPerUser || 0,
      permissionOverwrites: []
    };

    if (channel.permissionOverwrites) {
      for (const overwrite of channel.permissionOverwrites.cache.values()) {
        data.permissionOverwrites.push({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString()
        });
      }
    }

    backup.channels.push(data);
  }

  fs.writeFileSync(
    BACKUP_FILE,
    JSON.stringify(backup, null, 2),
    "utf8"
  );

  return backup;
}

async function restoreBackup(guild) {
  if (!fs.existsSync(BACKUP_FILE)) {
    throw new Error("Nie znaleziono backupu.");
  }

  const backup = JSON.parse(
    fs.readFileSync(BACKUP_FILE, "utf8")
  );

  const existingNames = new Set(
    guild.channels.cache.map(channel => channel.name)
  );

  const createdCategories = new Map();

  // Najpierw kategorie
  const categories = backup.channels.filter(
    channel => channel.type === ChannelType.GuildCategory
  );

  for (const data of categories) {
    if (existingNames.has(data.name)) {
      const existing = guild.channels.cache.find(
        channel =>
          channel.name === data.name &&
          channel.type === ChannelType.GuildCategory
      );

      if (existing) {
        createdCategories.set(data.id, existing.id);
      }

      continue;
    }

    const category = await guild.channels.create({
      name: data.name,
      type: ChannelType.GuildCategory
    });

    createdCategories.set(data.id, category.id);
  }

  // Potem pozostałe kanały
  const normalChannels = backup.channels.filter(
    channel => channel.type !== ChannelType.GuildCategory
  );

  for (const data of normalChannels) {
    if (existingNames.has(data.name)) {
      continue;
    }

    let parentId = null;

    if (data.parentId) {
      parentId = createdCategories.get(data.parentId) || null;
    }

    const options = {
      name: data.name,
      type: data.type
    };

    if (parentId) {
      options.parent = parentId;
    }

    if (
      data.type === ChannelType.GuildText ||
      data.type === ChannelType.GuildAnnouncement ||
      data.type === ChannelType.GuildForum
    ) {
      if (data.topic) {
        options.topic = data.topic;
      }

      options.nsfw = Boolean(data.nsfw);
      options.rateLimitPerUser = data.rateLimitPerUser || 0;
    }

    try {
      const channel = await guild.channels.create(options);

      console.log("Przywrócono kanał:", channel.name);
    } catch (error) {
      console.log(
        "Nie udało się przywrócić kanału:",
        data.name,
        error.message
      );
    }
  }

  return true;
}

// =====================================================
// KOMENDY
// =====================================================

const commands = [

  new SlashCommandBuilder()
    .setName("weryfikacja")
    .setDescription("Wyślij panel weryfikacji"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Wyślij panel ticketów"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Usuń wiadomości")
    .addIntegerOption(option =>
      option
        .setName("ilosc")
        .setDescription("Ilość wiadomości 1-100")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Zbanuj użytkownika")
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("powod")
        .setDescription("Powód")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Wyrzuć użytkownika")
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("powod")
        .setDescription("Powód")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Wycisz użytkownika na 10 minut")
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Zdejmij wyciszenie")
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Wyślij wiadomość jako bot")
    .addStringOption(option =>
      option
        .setName("tekst")
        .setDescription("Treść wiadomości")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Informacje o serwerze"),

  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Utwórz backup kanałów serwera"),

  new SlashCommandBuilder()
    .setName("restore")
    .setDescription("Przywróć kanały z backupu"),

  new SlashCommandBuilder()
    .setName("usun-kanaly")
    .setDescription("USUŃ KANAŁY - tylko właściciel")
];

// =====================================================
// READY
// =====================================================

client.once(Events.ClientReady, async () => {
  console.log(`Zalogowano jako ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);

    if (!guild) {
      console.log("Nie znaleziono serwera.");
      return;
    }

    await guild.commands.set(
      commands.map(command => command.toJSON())
    );

    console.log("Komendy slash zostały zarejestrowane.");
    console.log(`Serwer: ${guild.name}`);
  } catch (error) {
    console.error(
      "Błąd podczas rejestrowania komend:",
      error
    );
  }
});

// =====================================================
// OCHRONA PRZED OBCYMI BOTAMI
// =====================================================

client.on(Events.GuildMemberAdd, async member => {

  // Normalny użytkownik
  if (!member.user.bot) {

    if (isConfigured(config.WELCOME_CHANNEL_ID)) {
      const channel =
        member.guild.channels.cache.get(
          config.WELCOME_CHANNEL_ID
        );

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("👋 Witamy na serwerze!")
          .setDescription(
            `Witaj ${member} na **${member.guild.name}**!\n\n` +
            `Aby uzyskać dostęp do serwera, przejdź weryfikację.`
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp();

        channel.send({
          embeds: [embed]
        }).catch(() => {});
      }
    }

    return;
  }

  // ===================================================
  // JEŻELI DOŁĄCZYŁ BOT
  // ===================================================

  console.log(
    `⚠️ Nowy bot dołączył: ${member.user.tag}`
  );

  // Chwila na pojawienie się wpisu w Audit Log
  setTimeout(async () => {

    try {
      const auditLogs =
        await member.guild.fetchAuditLogs({
          type: AuditLogEvent.BotAdd,
          limit: 10
        });

      const entry = auditLogs.entries.find(
        entry =>
          entry.target &&
          entry.target.id === member.id
      );

      const executor = entry?.executor;

      // Nie znaleziono osoby dodającej
      if (!executor) {
        await sendLog(
          member.guild,
          "⚠️ OCHRONA BOTÓW",
          `Nie udało się ustalić, kto dodał bota **${member.user.tag}**.\n` +
          `Bot pozostawiono na serwerze do ręcznej kontroli.`
        );

        return;
      }

      // Właściciel może dodawać boty
      if (
        executor.id === config.OWNER_ID &&
        member.guild.ownerId === executor.id
      ) {

        await sendLog(
          member.guild,
          "✅ Bot dodany przez właściciela",
          `Bot: **${member.user.tag}**\n` +
          `Dodany przez: <@${executor.id}>`
        );

        return;
      }

      // Ktoś inny dodał bota
      await sendLog(
        member.guild,
        "🚨 OCHRONA ANTY-NUKE",
        `Wykryto próbę dodania obcego bota!\n\n` +
        `🤖 Bot: **${member.user.tag}**\n` +
        `👤 Dodał: <@${executor.id}>\n\n` +
        `Bot zostanie usunięty.`
      );

      try {
        await member.kick(
          "Anti-Nuke: bot dodany przez osobę inną niż właściciel serwera."
        );

        console.log(
          `🚨 Usunięto obcego bota: ${member.user.tag}`
        );
      } catch (kickError) {
        console.log(
          "Nie udało się usunąć obcego bota:",
          kickError.message
        );
      }

    } catch (error) {

      console.log(
        "Błąd Anti-Nuke:",
        error.message
      );

      await sendLog(
        member.guild,
        "🚨 BŁĄD OCHRONY",
        `Nie udało się sprawdzić osoby, która dodała bota.\n\n` +
        `Bot: **${member.user.tag}**\n` +
        `Błąd: \`${error.message}\``
      );
    }

  }, 2000);
});

// =====================================================
// OPUSZCZENIE SERWERA
// =====================================================

client.on(Events.GuildMemberRemove, async member => {

  await sendLog(
    member.guild,
    "🚪 Użytkownik opuścił serwer",
    `Użytkownik: **${member.user.tag}**\n` +
    `ID: \`${member.id}\``
  );
});

// =====================================================
// USUNIĘCIE WIADOMOŚCI
// =====================================================

client.on(Events.MessageDelete, async message => {

  if (!message.guild) return;

  await sendLog(
    message.guild,
    "🗑️ Usunięto wiadomość",
    `Kanał: <#${message.channel?.id || "nieznany"}>\n` +
    `Autor: **${message.author?.tag || "Nieznany"}**`
  );
});

// =====================================================
// SPAM
// =====================================================

client.on(Events.MessageCreate, async message => {

  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content.trim();

  if (!content) return;

  const key = `${message.author.id}:${content.toLowerCase()}`;

  const count = (spamCounter.get(key) || 0) + 1;

  spamCounter.set(key, count);

  setTimeout(() => {
    spamCounter.delete(key);
  }, 15000);

  if (count === 5) {

    spamCounter.delete(key);

    try {
      await message.member.timeout(
        60 * 1000,
        "Automatyczny anty-spam"
      );

      await message.channel.send(
        `⚠️ ${message.author}, otrzymujesz automatyczne wyciszenie za spam.`
      );

      await sendLog(
        message.guild,
        "🚨 AUTOMATYCZNY ANTYS-PAM",
        `Użytkownik: <@${message.author.id}>\n` +
        `Powód: 5 takich samych wiadomości.`
      );

    } catch (error) {
      console.log(
        "Błąd anty-spamu:",
        error.message
      );
    }
  }
});

// =====================================================
// INTERACTIONS
// =====================================================

client.on(Events.InteractionCreate, async interaction => {

  try {

    // =================================================
    // SLASH COMMANDS
    // =================================================

    if (interaction.isChatInputCommand()) {

      // ===============================================
      // WERYFIKACJA
      // ===============================================

      if (interaction.commandName === "weryfikacja") {

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🛡️ WERYFIKACJA")
          .setDescription(
            "**Witaj na serwerze!**\n\n" +
            "Aby uzyskać dostęp do serwera, musisz przejść weryfikację.\n\n" +
            "Kliknij przycisk poniżej i:\n" +
            "• wpisz swój **nick Minecraft**,\n" +
            "• rozwiąż proste działanie matematyczne,\n" +
            "• po poprawnej odpowiedzi otrzymasz rangę zweryfikowanego.\n\n" +
            "Twój nick Minecraft zostanie również ustawiony jako Twój pseudonim na Discordzie."
          )
          .setFooter({
            text: "System weryfikacji"
          })
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("verify")
              .setLabel("Zweryfikuj się")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success)
          );

        await interaction.reply({
          embeds: [embed],
          components: [row]
        });

        return;
      }

      // ===============================================
      // TICKET
      // ===============================================

      if (interaction.commandName === "ticket") {

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 CENTRUM POMOCY")
          .setDescription(
            "Potrzebujesz pomocy? Utwórz ticket!\n\n" +
            "Wybierz odpowiednią kategorię, a następnie uzupełnij formularz.\n\n" +
            "**Dostępne kategorie:**\n" +
            "🆘 Pomoc z wejściem na serwer\n" +
            "🚨 Zgłoszenie gracza\n" +
            "🎥 Media / Twórca\n" +
            "🤝 Współpraca\n" +
            "🐛 Zgłoszenie błędu\n" +
            "🔨 Odwołanie od bana\n" +
            "📩 Inne\n\n" +
            "**Przygotuj:**\n" +
            "• swój nick Minecraft\n" +
            "• dokładny opis problemu\n" +
            "• screen, jeśli jest potrzebny"
          )
          .setFooter({
            text: "Administracja odpowie tak szybko, jak to możliwe."
          })
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("create_ticket")
              .setLabel("Utwórz ticket")
              .setEmoji("🎫")
              .setStyle(ButtonStyle.Primary)
          );

        await interaction.reply({
          embeds: [embed],
          components: [row]
        });

        return;
      }

      // ===============================================
      // CLEAR
      // ===============================================

      if (interaction.commandName === "clear") {

        if (
          !interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień do usuwania wiadomości.",
            ephemeral: true
          });
        }

        const amount = interaction.options.getInteger("ilosc");

        await interaction.channel.bulkDelete(
          amount,
          true
        );

        await interaction.reply({
          content: `🗑️ Usunięto **${amount}** wiadomości.`,
          ephemeral: true
        });

        await sendLog(
          interaction.guild,
          "🗑️ CLEAR",
          `<@${interaction.user.id}> usunął **${amount}** wiadomości.`
        );

        return;
      }

      // ===============================================
      // BAN
      // ===============================================

      if (interaction.commandName === "ban") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel serwera może używać tej komendy.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const reason =
          interaction.options.getString("powod") ||
          "Brak powodu";

        const member =
          await interaction.guild.members.fetch(
            user.id
          ).catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika na serwerze.",
            ephemeral: true
          });
        }

        await member.ban({
          reason
        });

        await interaction.reply({
          content:
            `🔨 Zbanowano **${user.tag}**.\n` +
            `Powód: **${reason}**`
        });

        await sendLog(
          interaction.guild,
          "🔨 BAN",
          `Użytkownik: **${user.tag}**\n` +
          `Właściciel: <@${interaction.user.id}>\n` +
          `Powód: ${reason}`
        );

        return;
      }

      // ===============================================
      // KICK
      // ===============================================

      if (interaction.commandName === "kick") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel serwera może używać tej komendy.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const reason =
          interaction.options.getString("powod") ||
          "Brak powodu";

        const member =
          await interaction.guild.members.fetch(
            user.id
          ).catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.kick(reason);

        await interaction.reply({
          content:
            `👢 Wyrzucono **${user.tag}**.\n` +
            `Powód: **${reason}**`
        });

        await sendLog(
          interaction.guild,
          "👢 KICK",
          `Użytkownik: **${user.tag}**\n` +
          `Powód: ${reason}`
        );

        return;
      }

      // ===============================================
      // MUTE
      // ===============================================

      if (interaction.commandName === "mute") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel serwera może używać tej komendy.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const member =
          await interaction.guild.members.fetch(
            user.id
          ).catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.timeout(
          10 * 60 * 1000,
          "Mute 10 minut"
        );

        await interaction.reply({
          content:
            `🔇 **${user.tag}** został wyciszony na 10 minut.`
        });

        await sendLog(
          interaction.guild,
          "🔇 MUTE",
          `Użytkownik: **${user.tag}**\n` +
          `Nałożony przez: <@${interaction.user.id}>`
        );

        return;
      }

      // ===============================================
      // UNMUTE
      // ===============================================

      if (interaction.commandName === "unmute") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel serwera może używać tej komendy.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const member =
          await interaction.guild.members.fetch(
            user.id
          ).catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.timeout(
          null,
          "Unmute"
        );

        await interaction.reply({
          content:
            `🔊 Zdjęto wyciszenie z **${user.tag}**.`
        });

        return;
      }

      // ===============================================
      // SAY
      // ===============================================

      if (interaction.commandName === "say") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel serwera może używać tej komendy.",
            ephemeral: true
          });
        }

        const text =
          interaction.options.getString("tekst");

        await interaction.reply({
          content: "✅ Wysłano wiadomość.",
          ephemeral: true
        });

        await interaction.channel.send(text);

        return;
      }

      // ===============================================
      // SERVERINFO
      // ===============================================

      if (interaction.commandName === "serverinfo") {

        const guild = interaction.guild;

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle(`📊 ${guild.name}`)
          .addFields(
            {
              name: "👑 Właściciel",
              value: `<@${guild.ownerId}>`,
              inline: true
            },
            {
              name: "👥 Członkowie",
              value: `${guild.memberCount}`,
              inline: true
            },
            {
              name: "💬 Kanały",
              value: `${guild.channels.cache.size}`,
              inline: true
            },
            {
              name: "🛡️ Role",
              value: `${guild.roles.cache.size}`,
              inline: true
            }
          )
          .setThumbnail(
            guild.iconURL({
              dynamic: true
            })
          )
          .setTimestamp();

        await interaction.reply({
          embeds: [embed]
        });

        return;
      }

      // ===============================================
      // BACKUP
      // ===============================================

      if (interaction.commandName === "backup") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel serwera może tworzyć backup.",
            ephemeral: true
          });
        }

        await interaction.deferReply({
          ephemeral: true
        });

        const backup =
          await createBackup(interaction.guild);

        await interaction.editReply(
          `✅ Backup został utworzony!\n\n` +
          `📁 Kanały zapisane: **${backup.channels.length}**\n` +
          `🕐 Data: <t:${Math.floor(Date.now() / 1000)}:F>`
        );

        await sendLog(
          interaction.guild,
          "💾 BACKUP",
          `Właściciel utworzył backup serwera.\n` +
          `Liczba kanałów: **${backup.channels.length}**`
        );

        return;
      }

      // ===============================================
      // RESTORE
      // ===============================================

      if (interaction.commandName === "restore") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel serwera może przywracać backup.",
            ephemeral: true
          });
        }

        await interaction.deferReply({
          ephemeral: true
        });

        await restoreBackup(interaction.guild);

        await interaction.editReply(
          "✅ Rozpoczęto przywracanie kanałów z backupu."
        );

        await sendLog(
          interaction.guild,
          "♻️ RESTORE",
          `Właściciel rozpoczął przywracanie kanałów z backupu.`
        );

        return;
      }

      // ===============================================
      // USUŃ KANAŁY
      // ===============================================

      if (interaction.commandName === "usun-kanaly") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content:
              "🚫 Ta komenda jest dostępna WYŁĄCZNIE dla właściciela serwera.",
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🚨 USUWANIE KANAŁÓW")
          .setDescription(
            "**UWAGA! Ta operacja jest bardzo niebezpieczna.**\n\n" +
            "Przed usunięciem kanałów bot automatycznie utworzy backup.\n\n" +
            "Po kliknięciu potwierdzenia będziesz musiał wpisać:\n\n" +
            `\`${config.DELETE_CONFIRM_TEXT}\`\n\n` +
            "Dopiero wtedy kanały zostaną usunięte."
          );

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("confirm_delete_channels")
              .setLabel("Kontynuuj")
              .setEmoji("⚠️")
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId("cancel_delete_channels")
              .setLabel("Anuluj")
              .setEmoji("❌")
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });

        return;
      }
    }

    // =================================================
    // BUTTONY
    // =================================================

    if (interaction.isButton()) {

      // ===============================================
      // WERYFIKACJA
      // ===============================================

      if (interaction.customId === "verify") {

        if (
          !isConfigured(config.VERIFIED_ROLE_ID)
        ) {
          return interaction.reply({
            content:
              "❌ Rola weryfikacyjna nie jest skonfigurowana.",
            ephemeral: true
          });
        }

        const member = interaction.member;

        if (
          member.roles.cache.has(
            config.VERIFIED_ROLE_ID
          )
        ) {
          return interaction.reply({
            content:
              "✅ Jesteś już zweryfikowany.",
            ephemeral: true
          });
        }

        const number1 =
          Math.floor(Math.random() * 20) + 1;

        const number2 =
          Math.floor(Math.random() * 20) + 1;

        const answer = number1 + number2;

        verificationQuestions.set(
          interaction.user.id,
          answer
        );

        const modal =
          new ModalBuilder()
            .setCustomId("verification_modal")
            .setTitle("🛡️ Weryfikacja");

        const nickInput =
          new TextInputBuilder()
            .setCustomId("minecraft_nick")
            .setLabel("Twój nick Minecraft")
            .setPlaceholder("np. Steve123")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(16);

        const mathInput =
          new TextInputBuilder()
            .setCustomId("math_answer")
            .setLabel(`Ile to ${number1} + ${number2}?`)
            .setPlaceholder("Wpisz wynik")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(5);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            nickInput
          ),
          new ActionRowBuilder().addComponents(
            mathInput
          )
        );

        await interaction.showModal(modal);

        return;
      }

      // ===============================================
      // TICKET
      // ===============================================

      if (interaction.customId === "create_ticket") {

        const existingTicket =
          interaction.guild.channels.cache.find(
            channel =>
              channel.name ===
              `ticket-${interaction.user.id}`
          );

        if (existingTicket) {
          return interaction.reply({
            content:
              `❌ Masz już otwarty ticket: ${existingTicket}`,
            ephemeral: true
          });
        }

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("ticket_help")
              .setLabel("Pomoc")
              .setEmoji("🆘")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId("ticket_report")
              .setLabel("Gracz")
              .setEmoji("🚨")
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId("ticket_media")
              .setLabel("Media")
              .setEmoji("🎥")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("ticket_partner")
              .setLabel("Współpraca")
              .setEmoji("🤝")
              .setStyle(ButtonStyle.Secondary)
          );

        const row2 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("ticket_bug")
              .setLabel("Bug")
              .setEmoji("🐛")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("ticket_ban")
              .setLabel("Odwołanie")
              .setEmoji("🔨")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("ticket_other")
              .setLabel("Inne")
              .setEmoji("📩")
              .setStyle(ButtonStyle.Secondary)
          );

        await interaction.reply({
          content:
            "🎫 **Wybierz kategorię swojego zgłoszenia:**",
          components: [row, row2],
          ephemeral: true
        });

        return;
      }

      // ===============================================
      // KATEGORIE TICKETÓW
      // ===============================================

      const ticketCategories = {
        ticket_help: "Pomoc z wejściem na serwer",
        ticket_report: "Zgłoszenie gracza",
        ticket_media: "Media / Twórca",
        ticket_partner: "Współpraca",
        ticket_bug: "Zgłoszenie błędu",
        ticket_ban: "Odwołanie od bana",
        ticket_other: "Inne"
      };

      if (
        ticketCategories[interaction.customId]
      ) {

        const category =
          ticketCategories[interaction.customId];

        const modal =
          new ModalBuilder()
            .setCustomId(
              `ticket_modal_${interaction.customId}`
            )
            .setTitle("🎫 Utworzenie ticketu");

        const nickInput =
          new TextInputBuilder()
            .setCustomId("ticket_nick")
            .setLabel("Twój nick Minecraft")
            .setPlaceholder("Wpisz swój nick Minecraft")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(16);

        const problemInput =
          new TextInputBuilder()
            .setCustomId("ticket_problem")
            .setLabel("Opisz dokładnie problem")
            .setPlaceholder(
              "Napisz dokładnie, w czym potrzebujesz pomocy..."
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const screenInput =
          new TextInputBuilder()
            .setCustomId("ticket_screen")
            .setLabel("Screen / dodatkowe informacje")
            .setPlaceholder(
              "Opcjonalnie - możesz wkleić link do screena"
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            nickInput
          ),
          new ActionRowBuilder().addComponents(
            problemInput
          ),
          new ActionRowBuilder().addComponents(
            screenInput
          )
        );

        await interaction.showModal(modal);

        return;
      }

      // ===============================================
      // CLAIM TICKET
      // ===============================================

      if (
        interaction.customId === "claim_ticket"
      ) {

        if (
          !memberCanManageTicket(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Nie masz uprawnień do przejęcia tego ticketu.",
            ephemeral: true
          });
        }

        await interaction.reply({
          content:
            `👤 Ticket został przejęty przez <@${interaction.user.id}>.`
        });

        await sendLog(
          interaction.guild,
          "🎫 TICKET PRZEJĘTY",
          `Ticket: ${interaction.channel}\n` +
          `Przejął: <@${interaction.user.id}>`
        );

        return;
      }

      // ===============================================
      // CLOSE TICKET
      // ===============================================

      if (
        interaction.customId === "close_ticket"
      ) {

        if (
          !memberCanManageTicket(
            interaction.member
          ) &&
          interaction.channel.name !==
            `ticket-${interaction.user.id}`
        ) {
          return interaction.reply({
            content:
              "❌ Nie możesz zamknąć tego ticketu.",
            ephemeral: true
          });
        }

        await interaction.reply({
          content:
            "🔒 Ticket zostanie zamknięty za 3 sekundy."
        });

        await sendLog(
          interaction.guild,
          "🔒 TICKET ZAMKNIĘTY",
          `Kanał: **${interaction.channel.name}**\n` +
          `Zamknął: <@${interaction.user.id}>`
        );

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 3000);

        return;
      }

      // ===============================================
      // USUWANIE KANAŁÓW - KONTYNUUJ
      // ===============================================

      if (
        interaction.customId ===
        "confirm_delete_channels"
      ) {

        if (!isOwner(interaction)) {
          return interaction.update({
            content:
              "🚫 Nie masz prawa wykonać tej operacji.",
            embeds: [],
            components: []
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId("delete_channels_modal")
            .setTitle("⚠️ Potwierdzenie usuwania");

        const input =
          new TextInputBuilder()
            .setCustomId("delete_confirmation")
            .setLabel(
              `Wpisz: ${config.DELETE_CONFIRM_TEXT}`
            )
            .setPlaceholder(
              config.DELETE_CONFIRM_TEXT
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            input
          )
        );

        await interaction.showModal(modal);

        return;
      }

      // ===============================================
      // USUWANIE KANAŁÓW - ANULUJ
      // ===============================================

      if (
        interaction.customId ===
        "cancel_delete_channels"
      ) {

        if (!isOwner(interaction)) {
          return interaction.update({
            content:
              "🚫 Nie masz prawa wykonać tej operacji.",
            embeds: [],
            components: []
          });
        }

        await interaction.update({
          content:
            "✅ Operacja została anulowana.",
          embeds: [],
          components: []
        });

        return;
      }
    }

    // =================================================
    // MODALE
    // =================================================

    if (interaction.isModalSubmit()) {

      // ===============================================
      // WERYFIKACJA
      // ===============================================

      if (
        interaction.customId ===
        "verification_modal"
      ) {

        const nick =
          interaction.fields.getTextInputValue(
            "minecraft_nick"
          );

        const math =
          interaction.fields.getTextInputValue(
            "math_answer"
          );

        const correctAnswer =
          verificationQuestions.get(
            interaction.user.id
          );

        if (!correctAnswer) {
          return interaction.reply({
            content:
              "❌ Weryfikacja wygasła. Kliknij przycisk ponownie.",
            ephemeral: true
          });
        }

        if (
          Number(math) !==
          Number(correctAnswer)
        ) {

          verificationQuestions.delete(
            interaction.user.id
          );

          return interaction.reply({
            content:
              "❌ Niepoprawny wynik działania. Spróbuj ponownie.",
            ephemeral: true
          });
        }

        verificationQuestions.delete(
          interaction.user.id
        );

        const member =
          interaction.member;

        const role =
          interaction.guild.roles.cache.get(
            config.VERIFIED_ROLE_ID
          );

        if (!role) {
          return interaction.reply({
            content:
              "❌ Nie znaleziono roli weryfikacyjnej.",
            ephemeral: true
          });
        }

        await member.roles.add(
          role,
          "Poprawna weryfikacja"
        );

        // Zmiana pseudonimu na nick Minecraft
        try {

          await member.setNickname(
            nick,
            "Weryfikacja Minecraft"
          );

        } catch (error) {

          console.log(
            "Nie udało się zmienić pseudonimu:",
            error.message
          );
        }

        await interaction.reply({
          content:
            `✅ **Weryfikacja zakończona pomyślnie!**\n\n` +
            `🎮 Nick Minecraft: **${nick}**\n` +
            `🛡️ Otrzymałeś rangę: ${role}\n` +
            `✏️ Twój pseudonim został ustawiony na **${nick}**.`,
          ephemeral: true
        });

        await sendLog(
          interaction.guild,
          "✅ NOWA WERYFIKACJA",
          `Użytkownik: <@${interaction.user.id}>\n` +
          `Nick Minecraft: **${nick}**`
        );

        return;
      }

      // ===============================================
      // TICKET MODAL
      // ===============================================

      if (
        interaction.customId.startsWith(
          "ticket_modal_"
        )
      ) {

        const ticketType =
          interaction.customId.replace(
            "ticket_modal_",
            ""
          );

        const categories = {
          ticket_help: "Pomoc z wejściem na serwer",
          ticket_report: "Zgłoszenie gracza",
          ticket_media: "Media / Twórca",
          ticket_partner: "Współpraca",
          ticket_bug: "Zgłoszenie błędu",
          ticket_ban: "Odwołanie od bana",
          ticket_other: "Inne"
        };

        const category =
          categories[ticketType] || "Inne";

        const nick =
          interaction.fields.getTextInputValue(
            "ticket_nick"
          );

        const problem =
          interaction.fields.getTextInputValue(
            "ticket_problem"
          );

        const screen =
          interaction.fields.getTextInputValue(
            "ticket_screen"
          ) || "Brak";

        const existingTicket =
          interaction.guild.channels.cache.find(
            channel =>
              channel.name ===
              `ticket-${interaction.user.id}`
          );

        if (existingTicket) {
          return interaction.reply({
            content:
              `❌ Masz już ticket: ${existingTicket}`,
            ephemeral: true
          });
        }

        const permissionOverwrites = [
          {
            id: interaction.guild.id,
            deny: [
              PermissionsBitField.Flags.ViewChannel
            ]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }
        ];

        for (
          const roleId of getTicketStaffRoles()
        ) {

          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageChannels
            ]
          });
        }

        const channel =
          await interaction.guild.channels.create({
            name:
              `ticket-${interaction.user.id}`,
            type: ChannelType.GuildText,
            parent:
              config.TICKET_CATEGORY_ID,
            permissionOverwrites
          });

        const embed =
          new EmbedBuilder()
            .setColor(config.EMBED_COLOR)
            .setTitle("🎫 NOWY TICKET")
            .setDescription(
              `Witaj ${interaction.user}!\n\n` +
              `Administracja zajmie się Twoim zgłoszeniem.\n\n` +
              `**Kategoria:**\n${category}\n\n` +
              `**Nick Minecraft:**\n${nick}\n\n` +
              `**Opis:**\n${problem}\n\n` +
              `**Screen / dodatkowe informacje:**\n${screen}`
            )
            .setFooter({
              text:
                "Nie oznaczaj administracji bez potrzeby."
            })
            .setTimestamp();

        const buttons =
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId("claim_ticket")
                .setLabel("Przejmij")
                .setEmoji("👤")
                .setStyle(ButtonStyle.Primary),

              new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("Zamknij")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger)
            );

        await channel.send({
          content:
            `${interaction.user} ${getTicketStaffRoles()
              .map(id => `<@&${id}>`)
              .join(" ")}`,
          embeds: [embed],
          components: [buttons]
        });

        await interaction.reply({
          content:
            `✅ Ticket został utworzony: ${channel}`,
          ephemeral: true
        });

        await sendLog(
          interaction.guild,
          "🎫 NOWY TICKET",
          `Użytkownik: <@${interaction.user.id}>\n` +
          `Kategoria: **${category}**\n` +
          `Kanał: ${channel}`
        );

        return;
      }

      // ===============================================
      // POTWIERDZENIE USUWANIA KANAŁÓW
      // ===============================================

      if (
        interaction.customId ===
        "delete_channels_modal"
      ) {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content:
              "🚫 Nie masz prawa wykonać tej operacji.",
            ephemeral: true
          });
        }

        const confirmation =
          interaction.fields.getTextInputValue(
            "delete_confirmation"
          );

        if (
          confirmation !==
          config.DELETE_CONFIRM_TEXT
        ) {
          return interaction.reply({
            content:
              "❌ Niepoprawne potwierdzenie. Kanały NIE zostały usunięte.",
            ephemeral: true
          });
        }

        await interaction.deferReply({
          ephemeral: true
        });

        // Automatyczny backup
        try {
          await createBackup(
            interaction.guild
          );
        } catch (error) {
          return interaction.editReply(
            "❌ Nie udało się utworzyć backupu. Operacja została przerwana."
          );
        }

        const channels = [
          ...interaction.guild.channels.cache.values()
        ];

        let deleted = 0;

        for (const channel of channels) {

          try {

            await channel.delete(
              "Owner command: usuwanie kanałów"
            );

            deleted++;

          } catch (error) {

            console.log(
              `Nie udało się usunąć ${channel.name}:`,
              error.message
            );
          }
        }

        await interaction.editReply(
          `🚨 Operacja zakończona.\n\n` +
          `🗑️ Usunięto kanałów: **${deleted}**\n` +
          `💾 Backup został zapisany przed usunięciem.`
        );

        await sendLog(
          interaction.guild,
          "🚨 USUNIĘTO KANAŁY",
          `Właściciel wykonał komendę usuwania kanałów.\n` +
          `Usunięto: **${deleted}** kanałów.`
        );

        return;
      }
    }

  } catch (error) {

    console.error(
      "Błąd Interaction:",
      error
    );

    try {

      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction.followUp({
          content:
            "❌ Wystąpił błąd podczas wykonywania operacji.",
          ephemeral: true
        });

      } else {

        await interaction.reply({
          content:
            "❌ Wystąpił błąd podczas wykonywania operacji.",
          ephemeral: true
        });

      }

    } catch {}
  }
});

// =====================================================
// LOGOWANIE BOTA
// =====================================================

if (!process.env.DISCORD_TOKEN) {

  console.error(
    "❌ Brak DISCORD_TOKEN w zmiennych środowiskowych."
  );

  process.exit(1);
}

client
  .login(process.env.DISCORD_TOKEN)
  .catch(error => {

    console.error(
      "❌ Nie udało się zalogować bota:"
    );

    console.error(error);
  });
