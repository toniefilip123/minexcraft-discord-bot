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
  StringSelectMenuBuilder,
  AuditLogEvent,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

const config = require("./config");

// =====================================================
// RENDER HTTP
// =====================================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Bot Discord działa!");
}).listen(PORT, "0.0.0.0", () => {
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
// MAPY / DANE
// =====================================================

const spamCounter = new Map();
const verificationQuestions = new Map();

// GRY KÓŁKO I KRZYŻYK
const ticTacToeGames = new Map();

const BACKUP_FILE = path.join(__dirname, "backup.json");

// =====================================================
// FUNKCJE
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
    console.log("Błąd logów:", error.message);
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
    backup.channels.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId || null,
      position: channel.rawPosition,
      topic: channel.topic || null,
      nsfw: channel.nsfw || false,
      rateLimitPerUser: channel.rateLimitPerUser || 0
    });
  }

  fs.writeFileSync(
    BACKUP_FILE,
    JSON.stringify(backup, null, 2),
    "utf8"
  );

  return backup;
}

// =====================================================
// KÓŁKO I KRZYŻYK
// =====================================================

function getTicTacToeWinner(board) {
  const combinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],

    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],

    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const [a, b, c] of combinations) {
    if (
      board[a] &&
      board[a] === board[b] &&
      board[a] === board[c]
    ) {
      return board[a];
    }
  }

  return null;
}

function createTicTacToeButtons(gameId, board, disabled = false) {
  const rows = [];

  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    const row = new ActionRowBuilder();

    for (let columnIndex = 0; columnIndex < 3; columnIndex++) {
      const index = rowIndex * 3 + columnIndex;

      const value = board[index];

      const button = new ButtonBuilder()
        .setCustomId(`ttt_${gameId}_${index}`)
        .setLabel(
          value === "X"
            ? "❌"
            : value === "O"
              ? "⭕"
              : "・"
        )
        .setDisabled(disabled || Boolean(value));

      if (value === "X") {
        button.setStyle(ButtonStyle.Danger);
      } else if (value === "O") {
        button.setStyle(ButtonStyle.Primary);
      } else {
        button.setStyle(ButtonStyle.Secondary);
      }

      row.addComponents(button);
    }

    rows.push(row);
  }

  return rows;
}

async function deleteTicTacToeGame(gameId) {
  const game = ticTacToeGames.get(gameId);

  if (!game) return;

  ticTacToeGames.delete(gameId);

  try {
    const channel = await client.channels.fetch(game.channelId);

    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(game.messageId);

    await message.delete().catch(() => {});
  } catch (error) {
    console.log("Gra już nie istnieje lub nie można jej usunąć.");
  }
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
    .setName("kolkoikrzyzyk")
    .setDescription("Zagraj w kółko i krzyżyk")
    .addUserOption(option =>
      option
        .setName("gracz")
        .setDescription("Wybierz przeciwnika")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Usuń wiadomości")
    .addIntegerOption(option =>
      option
        .setName("ilosc")
        .setDescription("Ilość wiadomości")
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
    .setDescription("Utwórz backup kanałów"),

  new SlashCommandBuilder()
    .setName("usun-kanaly")
    .setDescription("Usuń wszystkie kanały - tylko właściciel")
];

// =====================================================
// READY
// =====================================================

client.once(Events.ClientReady, async () => {
  console.log(`Zalogowano jako ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(config.GUILD_ID);

    await guild.commands.set(
      commands.map(command => command.toJSON())
    );

    console.log("Komendy slash zostały zarejestrowane.");
  } catch (error) {
    console.error("Błąd rejestracji komend:", error);
  }
});

// =====================================================
// NOWY UŻYTKOWNIK / ANTY BOT
// =====================================================

client.on(Events.GuildMemberAdd, async member => {

  // NORMALNY UŻYTKOWNIK
  if (!member.user.bot) {
    const channel = member.guild.channels.cache.get(
      config.WELCOME_CHANNEL_ID
    );

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(config.EMBED_COLOR)
        .setTitle("👋 Witamy!")
        .setDescription(
          `Witaj ${member} na serwerze **${member.guild.name}**!\n\n` +
          `Przejdź weryfikację, aby uzyskać dostęp do serwera.`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      channel.send({
        embeds: [embed]
      }).catch(() => {});
    }

    return;
  }

  // BOT
  setTimeout(async () => {
    try {
      const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.BotAdd,
        limit: 10
      });

      const entry = auditLogs.entries.find(
        log => log.target?.id === member.id
      );

      const executor = entry?.executor;

      if (!executor) return;

      // WŁAŚCICIEL MOŻE DODAĆ BOTA
      if (
        executor.id === config.OWNER_ID &&
        executor.id === member.guild.ownerId
      ) {
        await sendLog(
          member.guild,
          "✅ Dodano bota",
          `Bot **${member.user.tag}** został dodany przez właściciela.`
        );

        return;
      }

      await sendLog(
        member.guild,
        "🚨 WYKRYTO OBCEGO BOTA",
        `Bot: **${member.user.tag}**\n` +
        `Dodany przez: <@${executor.id}>\n\n` +
        `Bot został automatycznie usunięty.`
      );

      await member.kick(
        "Anti-Nuke: bot nie został dodany przez właściciela"
      ).catch(() => {});

    } catch (error) {
      console.log("AntiBot error:", error.message);
    }
  }, 1500);
});

// =====================================================
// SPAM
// =====================================================

client.on(Events.MessageCreate, async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (!content) return;

  const key = `${message.author.id}:${content}`;

  const count = (spamCounter.get(key) || 0) + 1;

  spamCounter.set(key, count);

  setTimeout(() => {
    spamCounter.delete(key);
  }, 15000);

  if (count >= 5) {
    spamCounter.delete(key);

    try {
      await message.member.timeout(
        60 * 1000,
        "Automatyczny anty-spam"
      );

      await message.channel.send(
        `⚠️ ${message.author}, zostałeś wyciszony za spam.`
      );

    } catch {}
  }
});

// =====================================================
// INTERACTIONS
// =====================================================

client.on(Events.InteractionCreate, async interaction => {
  try {

    // =================================================
    // KOMENDY SLASH
    // =================================================

    if (interaction.isChatInputCommand()) {

      // =================================================
      // KÓŁKO I KRZYŻYK
      // =================================================

      if (interaction.commandName === "kolkoikrzyzyk") {

        const opponent = interaction.options.getUser("gracz");

        if (opponent.bot) {
          return interaction.reply({
            content: "❌ Nie możesz grać przeciwko botowi.",
            ephemeral: true
          });
        }

        if (opponent.id === interaction.user.id) {
          return interaction.reply({
            content: "❌ Nie możesz grać sam ze sobą 😂",
            ephemeral: true
          });
        }

        const gameId =
          `${Date.now().toString(36)}${interaction.user.id.slice(-4)}`;

        const board = Array(9).fill(null);

        const game = {
          id: gameId,

          playerX: interaction.user.id,
          playerO: opponent.id,

          board,

          turn: interaction.user.id,

          channelId: interaction.channel.id,

          messageId: null,

          finished: false
        };

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("⭕ Kółko i krzyżyk ❌")
          .setDescription(
            `**Gracze:**\n\n` +
            `❌ <@${interaction.user.id}>\n` +
            `⭕ <@${opponent.id}>\n\n` +
            `🎮 Ruch: <@${interaction.user.id}>\n\n` +
            `⏱️ Gra zostanie automatycznie usunięta po **10 minutach**.`
          )
          .setFooter({
            text: "Kliknij wybrane pole na planszy"
          });

        await interaction.reply({
          embeds: [embed],
          components: createTicTacToeButtons(
            gameId,
            board
          )
        });

        const message = await interaction.fetchReply();

        game.messageId = message.id;

        ticTacToeGames.set(gameId, game);

        // =================================================
        // AUTOMATYCZNE USUNIĘCIE PO 10 MINUTACH
        // =================================================

        setTimeout(() => {
          deleteTicTacToeGame(gameId);
        }, 10 * 60 * 1000);

        return;
      }

      // =================================================
      // WERYFIKACJA
      // =================================================

      if (interaction.commandName === "weryfikacja") {

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🛡️ Weryfikacja")
          .setDescription(
            `Kliknij przycisk poniżej, aby przejść weryfikację.\n\n` +
            `🎮 Podasz swój **nick Minecraft**.\n` +
            `🧮 Rozwiążesz proste działanie matematyczne.\n` +
            `✅ Po poprawnej weryfikacji otrzymasz rangę.`
          );

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

      // =================================================
      // NOWY PANEL TICKETÓW
      // =================================================

      if (interaction.commandName === "ticket") {

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 Centrum Pomocy")
          .setDescription(
            `Potrzebujesz pomocy administracji?\n\n` +
            `Kliknij menu **Wybierz kategorię pomocy** poniżej i wybierz odpowiedni rodzaj zgłoszenia.\n\n` +
            `Po wybraniu kategorii pojawi się formularz, który należy wypełnić możliwie dokładnie.`
          )
          .setFooter({
            text: "Centrum Pomocy • Wybierz kategorię poniżej"
          })
          .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("ticket_category_select")
          .setPlaceholder("📂 Wybierz kategorię pomocy")
          .addOptions(
            {
              label: "Pomoc z serwerem",
              description: "Problem z wejściem lub działaniem serwera",
              value: "ticket_help",
              emoji: "🆘"
            },
            {
              label: "Zgłoszenie gracza",
              description: "Zgłoś gracza łamiącego regulamin",
              value: "ticket_report",
              emoji: "🚨"
            },
            {
              label: "Media / Twórca",
              description: "YouTube, TikTok, Twitch i inne",
              value: "ticket_media",
              emoji: "🎥"
            },
            {
              label: "Współpraca",
              description: "Propozycje współpracy",
              value: "ticket_partner",
              emoji: "🤝"
            },
            {
              label: "Zgłoszenie błędu",
              description: "Znalazłeś błąd na serwerze",
              value: "ticket_bug",
              emoji: "🐛"
            },
            {
              label: "Odwołanie od bana",
              description: "Chcesz odwołać się od kary",
              value: "ticket_ban",
              emoji: "🔨"
            },
            {
              label: "Inna sprawa",
              description: "Pozostałe sprawy",
              value: "ticket_other",
              emoji: "📩"
            }
          );

        const row = new ActionRowBuilder()
          .addComponents(selectMenu);

        await interaction.reply({
          embeds: [embed],
          components: [row]
        });

        return;
      }

      // =================================================
      // CLEAR
      // =================================================

      if (interaction.commandName === "clear") {

        if (
          !interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień.",
            ephemeral: true
          });
        }

        const amount = interaction.options.getInteger("ilosc");

        const deleted = await interaction.channel.bulkDelete(
          amount,
          true
        );

        await interaction.reply({
          content: `🗑️ Usunięto **${deleted.size}** wiadomości.`,
          ephemeral: true
        });

        return;
      }

      // =================================================
      // BAN
      // =================================================

      if (interaction.commandName === "ban") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel może używać tej komendy.",
            ephemeral: true
          });
        }

        const user = interaction.options.getUser("uzytkownik");

        const reason =
          interaction.options.getString("powod") ||
          "Brak powodu";

        const member =
          await interaction.guild.members.fetch(user.id)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.ban({
          reason
        });

        await interaction.reply({
          content:
            `🔨 Zbanowano **${user.tag}**\n` +
            `Powód: **${reason}**`
        });

        return;
      }

      // =================================================
      // KICK
      // =================================================

      if (interaction.commandName === "kick") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel może używać tej komendy.",
            ephemeral: true
          });
        }

        const user = interaction.options.getUser("uzytkownik");

        const reason =
          interaction.options.getString("powod") ||
          "Brak powodu";

        const member =
          await interaction.guild.members.fetch(user.id)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.kick(reason);

        await interaction.reply({
          content: `👢 Wyrzucono **${user.tag}**.`
        });

        return;
      }

      // =================================================
      // MUTE
      // =================================================

      if (interaction.commandName === "mute") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel może używać tej komendy.",
            ephemeral: true
          });
        }

        const user = interaction.options.getUser("uzytkownik");

        const member =
          await interaction.guild.members.fetch(user.id)
            .catch(() => null);

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
          content: `🔇 Wyciszono **${user.tag}** na 10 minut.`
        });

        return;
      }

      // =================================================
      // UNMUTE
      // =================================================

      if (interaction.commandName === "unmute") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel może używać tej komendy.",
            ephemeral: true
          });
        }

        const user = interaction.options.getUser("uzytkownik");

        const member =
          await interaction.guild.members.fetch(user.id)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.timeout(null);

        await interaction.reply({
          content: `🔊 Zdjęto wyciszenie z **${user.tag}**.`
        });

        return;
      }

      // =================================================
      // SAY
      // =================================================

      if (interaction.commandName === "say") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel może używać tej komendy.",
            ephemeral: true
          });
        }

        const text =
          interaction.options.getString("tekst");

        await interaction.reply({
          content: "✅ Wysłano.",
          ephemeral: true
        });

        await interaction.channel.send(text);

        return;
      }

      // =================================================
      // SERVER INFO
      // =================================================

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
          .setThumbnail(guild.iconURL())
          .setTimestamp();

        await interaction.reply({
          embeds: [embed]
        });

        return;
      }

      // =================================================
      // BACKUP
      // =================================================

      if (interaction.commandName === "backup") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content: "❌ Tylko właściciel może zrobić backup.",
            ephemeral: true
          });
        }

        const backup = await createBackup(interaction.guild);

        await interaction.reply({
          content:
            `✅ Backup został zapisany.\n` +
            `Kanały: **${backup.channels.length}**`,
          ephemeral: true
        });

        return;
      }

      // =================================================
      // USUŃ WSZYSTKIE KANAŁY
      // =================================================

      if (interaction.commandName === "usun-kanaly") {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content:
              "🚫 Ta komenda jest tylko dla właściciela serwera.",
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🚨 USUNĄĆ WSZYSTKIE KANAŁY?")
          .setDescription(
            `Ta operacja usunie **wszystkie kanały na serwerze**.\n\n` +
            `Przed usunięciem bot utworzy backup.\n\n` +
            `Kliknij przycisk poniżej, jeśli na pewno chcesz kontynuować.`
          );

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("delete_all_channels_confirm")
              .setLabel("Usuń wszystkie kanały")
              .setEmoji("🗑️")
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId("delete_all_channels_cancel")
              .setLabel("Anuluj")
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
    // SELECT MENU - TICKETY
    // =================================================

    if (interaction.isStringSelectMenu()) {

      if (
        interaction.customId ===
        "ticket_category_select"
      ) {

        const ticketType = interaction.values[0];

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

        const categoryNames = {
          ticket_help: "Pomoc z serwerem",
          ticket_report: "Zgłoszenie gracza",
          ticket_media: "Media / Twórca",
          ticket_partner: "Współpraca",
          ticket_bug: "Zgłoszenie błędu",
          ticket_ban: "Odwołanie od bana",
          ticket_other: "Inna sprawa"
        };

        const category =
          categoryNames[ticketType] ||
          "Ticket";

        const modal = new ModalBuilder()
          .setCustomId(
            `ticket_modal_${ticketType}`
          )
          .setTitle(category);

        const nick = new TextInputBuilder()
          .setCustomId("ticket_nick")
          .setLabel("Twój nick Minecraft")
          .setPlaceholder("np. Steve123")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(16);

        const problem = new TextInputBuilder()
          .setCustomId("ticket_problem")
          .setLabel("Opisz swoją sprawę")
          .setPlaceholder(
            "Napisz dokładnie, w czym potrzebujesz pomocy..."
          )
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);

        const screenshot = new TextInputBuilder()
          .setCustomId("ticket_screen")
          .setLabel("Screen / dodatkowe informacje")
          .setPlaceholder(
            "Opcjonalnie możesz wkleić link do screena"
          )
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nick),
          new ActionRowBuilder().addComponents(problem),
          new ActionRowBuilder().addComponents(screenshot)
        );

        await interaction.showModal(modal);

        return;
      }
    }

    // =================================================
    // BUTTONY
    // =================================================

    if (interaction.isButton()) {

      // =================================================
      // KÓŁKO I KRZYŻYK - RUCH
      // =================================================

      if (interaction.customId.startsWith("ttt_")) {

        const parts = interaction.customId.split("_");

        const gameId = parts[1];
        const position = Number(parts[2]);

        const game = ticTacToeGames.get(gameId);

        if (!game) {
          return interaction.reply({
            content:
              "❌ Ta gra już wygasła.",
            ephemeral: true
          });
        }

        if (game.finished) {
          return interaction.reply({
            content:
              "❌ Ta gra już się zakończyła.",
            ephemeral: true
          });
        }

        if (
          interaction.user.id !== game.playerX &&
          interaction.user.id !== game.playerO
        ) {
          return interaction.reply({
            content:
              "❌ Nie bierzesz udziału w tej grze.",
            ephemeral: true
          });
        }

        if (interaction.user.id !== game.turn) {
          return interaction.reply({
            content:
              "⏳ To nie jest teraz Twoja kolej.",
            ephemeral: true
          });
        }

        if (game.board[position]) {
          return interaction.reply({
            content:
              "❌ To pole jest już zajęte.",
            ephemeral: true
          });
        }

        const mark =
          interaction.user.id === game.playerX
            ? "X"
            : "O";

        game.board[position] = mark;

        const winner = getTicTacToeWinner(
          game.board
        );

        // =================================================
        // WYGRANA
        // =================================================

        if (winner) {

          game.finished = true;

          const winnerId =
            winner === "X"
              ? game.playerX
              : game.playerO;

          const embed = new EmbedBuilder()
            .setColor(config.EMBED_COLOR)
            .setTitle("🏆 Koniec gry!")
            .setDescription(
              `🎉 Wygrał <@${winnerId}>!\n\n` +
              `❌ <@${game.playerX}>\n` +
              `⭕ <@${game.playerO}>\n\n` +
              `🗑️ Wiadomość z grą zostanie usunięta po 10 minutach od rozpoczęcia gry.`
            );

          await interaction.update({
            embeds: [embed],
            components: createTicTacToeButtons(
              gameId,
              game.board,
              true
            )
          });

          return;
        }

        // =================================================
        // REMIS
        // =================================================

        if (
          game.board.every(field => field !== null)
        ) {

          game.finished = true;

          const embed = new EmbedBuilder()
            .setColor(config.EMBED_COLOR)
            .setTitle("🤝 Remis!")
            .setDescription(
              `Nikt nie wygrał.\n\n` +
              `❌ <@${game.playerX}>\n` +
              `⭕ <@${game.playerO}>`
            );

          await interaction.update({
            embeds: [embed],
            components: createTicTacToeButtons(
              gameId,
              game.board,
              true
            )
          });

          return;
        }

        // =================================================
        // NASTĘPNA TURA
        // =================================================

        game.turn =
          game.turn === game.playerX
            ? game.playerO
            : game.playerX;

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("⭕ Kółko i krzyżyk ❌")
          .setDescription(
            `**Gracze:**\n\n` +
            `❌ <@${game.playerX}>\n` +
            `⭕ <@${game.playerO}>\n\n` +
            `🎮 Ruch: <@${game.turn}>\n\n` +
            `⏱️ Gra zostanie usunięta po **10 minutach**.`
          );

        await interaction.update({
          embeds: [embed],
          components: createTicTacToeButtons(
            gameId,
            game.board
          )
        });

        return;
      }

      // =================================================
      // WERYFIKACJA
      // =================================================

      if (interaction.customId === "verify") {

        if (
          interaction.member.roles.cache.has(
            config.VERIFIED_ROLE_ID
          )
        ) {
          return interaction.reply({
            content:
              "✅ Jesteś już zweryfikowany.",
            ephemeral: true
          });
        }

        const a =
          Math.floor(Math.random() * 15) + 1;

        const b =
          Math.floor(Math.random() * 15) + 1;

        verificationQuestions.set(
          interaction.user.id,
          a + b
        );

        const modal = new ModalBuilder()
          .setCustomId("verification_modal")
          .setTitle("🛡️ Weryfikacja");

        const nick = new TextInputBuilder()
          .setCustomId("minecraft_nick")
          .setLabel("Nick Minecraft")
          .setPlaceholder("Twój nick Minecraft")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(16);

        const math = new TextInputBuilder()
          .setCustomId("math_answer")
          .setLabel(`Ile to ${a} + ${b}?`)
          .setPlaceholder("Wpisz wynik")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nick),
          new ActionRowBuilder().addComponents(math)
        );

        await interaction.showModal(modal);

        return;
      }

      // =================================================
      // CLAIM
      // =================================================

      if (interaction.customId === "claim_ticket") {

        if (
          !memberCanManageTicket(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Nie masz uprawnień.",
            ephemeral: true
          });
        }

        await interaction.reply({
          content:
            `👤 Ticket został przejęty przez ${interaction.user}.`
        });

        return;
      }

      // =================================================
      // CLOSE
      // =================================================

      if (interaction.customId === "close_ticket") {

        const isStaff =
          memberCanManageTicket(interaction.member);

        const isCreator =
          interaction.channel.name ===
          `ticket-${interaction.user.id}`;

        if (!isStaff && !isCreator) {
          return interaction.reply({
            content:
              "❌ Nie możesz zamknąć tego ticketu.",
            ephemeral: true
          });
        }

        await interaction.reply({
          content:
            "🔒 Ticket zostanie usunięty za 3 sekundy."
        });

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 3000);

        return;
      }

      // =================================================
      // USUWANIE WSZYSTKICH KANAŁÓW
      // =================================================

      if (
        interaction.customId ===
        "delete_all_channels_confirm"
      ) {

        if (!isOwner(interaction)) {
          return interaction.reply({
            content:
              "🚫 Tylko właściciel może to zrobić.",
            ephemeral: true
          });
        }

        await interaction.update({
          content:
            "⚠️ Tworzę backup i usuwam wszystkie kanały...",
          embeds: [],
          components: []
        });

        try {
          await createBackup(interaction.guild);
        } catch (error) {
          return;
        }

        const channels =
          [...interaction.guild.channels.cache.values()];

        for (const channel of channels) {
          try {
            await channel.delete(
              "Usunięcie wszystkich kanałów przez właściciela"
            );
          } catch (error) {
            console.log(
              `Nie usunięto ${channel.name}:`,
              error.message
            );
          }
        }

        return;
      }

      if (
        interaction.customId ===
        "delete_all_channels_cancel"
      ) {
        return interaction.update({
          content:
            "✅ Usuwanie kanałów anulowane.",
          embeds: [],
          components: []
        });
      }
    }

    // =================================================
    // MODALE
    // =================================================

    if (interaction.isModalSubmit()) {

      // =================================================
      // WERYFIKACJA
      // =================================================

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

        const correct =
          verificationQuestions.get(
            interaction.user.id
          );

        if (
          Number(math) !== Number(correct)
        ) {
          verificationQuestions.delete(
            interaction.user.id
          );

          return interaction.reply({
            content:
              "❌ Niepoprawny wynik.",
            ephemeral: true
          });
        }

        verificationQuestions.delete(
          interaction.user.id
        );

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

        await interaction.member.roles.add(role);

        try {
          await interaction.member.setNickname(
            nick
          );
        } catch {}

        await interaction.reply({
          content:
            `✅ Zweryfikowano!\n🎮 Twój nick: **${nick}**`,
          ephemeral: true
        });

        return;
      }

      // =================================================
      // TWORZENIE TICKETU
      // =================================================

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

        const categoryNames = {
          ticket_help: "Pomoc z serwerem",
          ticket_report: "Zgłoszenie gracza",
          ticket_media: "Media / Twórca",
          ticket_partner: "Współpraca",
          ticket_bug: "Zgłoszenie błędu",
          ticket_ban: "Odwołanie od bana",
          ticket_other: "Inna sprawa"
        };

        const category =
          categoryNames[ticketType] ||
          "Inna sprawa";

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
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          });
        }

        const ticketChannel =
          await interaction.guild.channels.create({
            name:
              `ticket-${interaction.user.id}`,

            type:
              ChannelType.GuildText,

            parent:
              config.TICKET_CATEGORY_ID,

            permissionOverwrites
          });

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 Nowy Ticket")
          .setDescription(
            `Witaj ${interaction.user}!\n\n` +

            `📂 **Kategoria**\n` +
            `${category}\n\n` +

            `🎮 **Nick Minecraft**\n` +
            `${nick}\n\n` +

            `📝 **Opis sprawy**\n` +
            `${problem}\n\n` +

            `🖼️ **Screen / dodatkowe informacje**\n` +
            `${screen}`
          )
          .setFooter({
            text:
              "Administracja odpowie tak szybko, jak to możliwe."
          })
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("claim_ticket")
              .setLabel("Przejmij ticket")
              .setEmoji("👤")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId("close_ticket")
              .setLabel("Zamknij ticket")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );

        const staffMentions =
          getTicketStaffRoles()
            .map(id => `<@&${id}>`)
            .join(" ");

        await ticketChannel.send({
          content:
            `${interaction.user} ${staffMentions}`,
          embeds: [embed],
          components: [row]
        });

        await interaction.reply({
          content:
            `✅ Ticket utworzony: ${ticketChannel}`,
          ephemeral: true
        });

        await sendLog(
          interaction.guild,
          "🎫 Nowy ticket",
          `Użytkownik: ${interaction.user}\n` +
          `Kategoria: **${category}**\n` +
          `Kanał: ${ticketChannel}`
        );

        return;
      }
    }

  } catch (error) {

    console.error(
      "Błąd interactionCreate:",
      error
    );

    try {
      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction.followUp({
          content:
            "❌ Wystąpił błąd.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content:
            "❌ Wystąpił błąd.",
          ephemeral: true
        });
      }
    } catch {}
  }
});

// =====================================================
// TOKEN
// =====================================================

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ Brak DISCORD_TOKEN na Renderze."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
