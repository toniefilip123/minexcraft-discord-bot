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
  Events,
  AttachmentBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

const config = require("./config");

// =====================================================
// HTTP SERVER - RENDER
// =====================================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Ravexmc.pl Discord Bot działa!");
}).listen(PORT, () => {
  console.log(`Serwer HTTP działa na porcie ${PORT}`);
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
// DATA
// =====================================================

const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, {
    recursive: true
  });
}

const backupFile = path.join(
  dataDir,
  "backup.json"
);

function loadJSON(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

// =====================================================
// HELPERS
// =====================================================

function isConfigured(value) {
  return value &&
    !String(value).startsWith("WSTAW_");
}

function isOwner(userId) {
  return userId === config.OWNER_ID;
}

function getLogChannel(guild) {
  if (!isConfigured(config.LOG_CHANNEL_ID)) {
    return null;
  }

  return guild.channels.cache.get(
    config.LOG_CHANNEL_ID
  ) || null;
}

async function sendLog(
  guild,
  title,
  description,
  color = config.EMBED_COLOR
) {
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
    console.log(
      "Błąd logu:",
      error.message
    );
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

  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  return getTicketStaffRoles().some(
    roleId =>
      member.roles.cache.has(roleId)
  );
}

// =====================================================
// TICKET CATEGORIES
// =====================================================

const ticketCategories = {

  ticket_help: {
    label: "Pomoc z serwerem",
    description:
      "Problem z wejściem lub działaniem serwera",
    emoji: "🆘"
  },

  ticket_report: {
    label: "Zgłoszenie gracza",
    description:
      "Zgłoś gracza łamiącego regulamin",
    emoji: "🚨"
  },

  ticket_media: {
    label: "Media / Twórca",
    description:
      "TikTok, YouTube, Twitch oraz ranga TWÓRCA",
    emoji: "🎥"
  },

  ticket_partner: {
    label: "Współpraca",
    description:
      "Propozycja współpracy",
    emoji: "🤝"
  },

  ticket_bug: {
    label: "Zgłoszenie błędu",
    description:
      "Znalazłeś błąd na serwerze",
    emoji: "🐛"
  },

  ticket_ban: {
    label: "Odwołanie od bana",
    description:
      "Odwołanie od nałożonej kary",
    emoji: "⚖️"
  },

  ticket_other: {
    label: "Inna sprawa",
    description:
      "Pozostałe sprawy",
    emoji: "📩"
  }
};

// =====================================================
// CREATE TICKET
// =====================================================

async function createTicket(
  interaction,
  categoryKey = "ticket_other"
) {
  const guild = interaction.guild;
  const user = interaction.user;

  const existing = guild.channels.cache.find(
    ch =>
      ch.name === `ticket-${user.id}`
  );

  if (existing) {
    return interaction.reply({
      content:
        `❌ Masz już otwarty ticket: ${existing}`,
      ephemeral: true
    });
  }

  const ticketCategory =
    guild.channels.cache.get(
      config.TICKET_CATEGORY_ID
    );

  if (!ticketCategory) {
    return interaction.reply({
      content:
        "❌ Nie znaleziono kategorii ticketów. Sprawdź `TICKET_CATEGORY_ID` w config.js.",
      ephemeral: true
    });
  }

  if (
    ticketCategory.type !==
    ChannelType.GuildCategory
  ) {
    return interaction.reply({
      content:
        "❌ Podane `TICKET_CATEGORY_ID` nie wskazuje na kategorię Discord.",
      ephemeral: true
    });
  }

  const me = guild.members.me;

  if (
    !me.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )
  ) {
    return interaction.reply({
      content:
        "❌ Bot nie ma uprawnienia **Zarządzanie kanałami**.",
      ephemeral: true
    });
  }

  const permissions = [

    {
      id: guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },

    {
      id: user.id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles
      ]
    }
  ];

  for (
    const roleId of getTicketStaffRoles()
  ) {
    permissions.push({
      id: roleId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  }

  let channel;

  try {

    channel = await guild.channels.create({
      name: `ticket-${user.id}`,
      type: ChannelType.GuildText,
      parent: ticketCategory.id,
      topic:
        `Ticket użytkownika ${user.tag}`,
      permissionOverwrites:
        permissions
    });

  } catch (error) {

    console.error(
      "Błąd tworzenia ticketu:",
      error
    );

    return interaction.reply({
      content:
        "❌ Nie udało się utworzyć ticketu. Sprawdź uprawnienia bota i kategorię ticketów.",
      ephemeral: true
    });
  }

  const category =
    ticketCategories[categoryKey] ||
    ticketCategories.ticket_other;

  const embed = new EmbedBuilder()
    .setColor(config.EMBED_COLOR)

    .setTitle(
      `${category.emoji} ${category.label}`
    )

    .setDescription(
      `Witaj ${user}!\n\n` +

      `**Kategoria:** ${category.label}\n\n` +

      `Opisz dokładnie swoją sprawę. Administracja odpowie tak szybko, jak będzie to możliwe.\n\n` +

      `📌 **Przy zgłoszeniu przygotuj:**\n` +

      `• swój nick Minecraft\n` +
      `• dokładny opis sprawy\n` +
      `• screenshot/nagranie, jeśli jest potrzebne\n\n` +

      `🔒 Nie oznaczaj całej administracji bez potrzeby.`
    )

    .setFooter({
      text:
        "Ravexmc.pl • System ticketów"
    })

    .setTimestamp();

  const buttons =
    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Przejmij ticket")
        .setEmoji("👋")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Zamknij ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger)
    );

  await channel.send({
    content:
      `${user} ${getTicketStaffRoles()
        .map(id => `<@&${id}>`)
        .join(" ")}`,

    embeds: [embed],
    components: [buttons]
  });

  await sendLog(
    guild,
    "🎫 Utworzono ticket",

    `Użytkownik: ${user}\n` +
    `Kanał: ${channel}\n` +
    `Kategoria: ${category.label}`
  );

  return interaction.reply({
    content:
      `✅ Ticket został utworzony: ${channel}`,
    ephemeral: true
  });
}

// =====================================================
// VERIFICATION
// =====================================================

const verificationQuestions =
  new Map();

function generateMathQuestion() {

  const a =
    Math.floor(Math.random() * 10) + 1;

  const b =
    Math.floor(Math.random() * 10) + 1;

  return {
    question: `${a} + ${b}`,
    answer: a + b
  };
}

function saveVerification(
  userId,
  question
) {

  const verification = {
    question: question.question,
    answer: question.answer,
    createdAt: Date.now()
  };

  verificationQuestions.set(
    userId,
    verification
  );

  setTimeout(() => {

    const current =
      verificationQuestions.get(userId);

    if (
      current &&
      current.createdAt ===
        verification.createdAt
    ) {

      verificationQuestions.delete(
        userId
      );

      console.log(
        `Weryfikacja użytkownika ${userId} wygasła.`
      );
    }

  }, 5 * 60 * 1000);
}

// =====================================================
// TIC TAC TOE
// =====================================================

const ticTacToeGames =
  new Map();

function createTicTacToeBoard(game) {

  const buttons = [];

  for (let i = 0; i < 9; i++) {

    const value =
      game.board[i] || "⬜";

    buttons.push(

      new ButtonBuilder()

        .setCustomId(
          `ttt_${game.id}_${i}`
        )

        .setLabel(
          value === "⬜"
            ? " "
            : value
        )

        .setEmoji(
          value === "❌"
            ? "❌"
            : value === "⭕"
              ? "⭕"
              : "⬜"
        )

        .setStyle(
          value === "⬜"
            ? ButtonStyle.Secondary
            : value === "❌"
              ? ButtonStyle.Danger
              : ButtonStyle.Primary
        )

        .setDisabled(
          value !== "⬜" ||
          game.finished
        )
    );
  }

  return [

    new ActionRowBuilder()
      .addComponents(
        buttons.slice(0, 3)
      ),

    new ActionRowBuilder()
      .addComponents(
        buttons.slice(3, 6)
      ),

    new ActionRowBuilder()
      .addComponents(
        buttons.slice(6, 9)
      )
  ];
}

function checkTicTacToeWinner(
  board
) {

  const lines = [

    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],

    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],

    [0, 4, 8],
    [2, 4, 6]
  ];

  for (
    const [a, b, c] of lines
  ) {

    if (
      board[a] &&
      board[a] === board[b] &&
      board[a] === board[c]
    ) {

      return board[a];
    }
  }

  if (
    board.every(Boolean)
  ) {
    return "DRAW";
  }

  return null;
}

// =====================================================
// ROCK PAPER SCISSORS
// =====================================================

const rpsGames =
  new Map();

const rpsChoices = {

  rock: {
    label: "Kamień",
    emoji: "🪨"
  },

  paper: {
    label: "Papier",
    emoji: "📄"
  },

  scissors: {
    label: "Nożyce",
    emoji: "✂️"
  }
};

function rpsWinner(
  player,
  bot
) {

  if (player === bot) {
    return "DRAW";
  }

  if (
    (player === "rock" &&
      bot === "scissors") ||

    (player === "paper" &&
      bot === "rock") ||

    (player === "scissors" &&
      bot === "paper")
  ) {

    return "PLAYER";
  }

  return "BOT";
}

function rpsButtons(game) {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          `rps_${game.id}_rock`
        )
        .setLabel("Kamień")
        .setEmoji("🪨")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(game.finished),

      new ButtonBuilder()
        .setCustomId(
          `rps_${game.id}_paper`
        )
        .setLabel("Papier")
        .setEmoji("📄")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(game.finished),

      new ButtonBuilder()
        .setCustomId(
          `rps_${game.id}_scissors`
        )
        .setLabel("Nożyce")
        .setEmoji("✂️")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(game.finished)
    );
}

// =====================================================
// CONTESTS
// =====================================================

const contests =
  new Map();

function parseDuration(input) {

  const match =
    String(input)
      .toLowerCase()
      .trim()
      .match(
        /^(\d+)\s*(s|m|h|d|w)$/
      );

  if (!match) {
    return null;
  }

  const amount =
    Number(match[1]);

  const unit =
    match[2];

  const multipliers = {

    s: 1000,

    m:
      60 * 1000,

    h:
      60 * 60 * 1000,

    d:
      24 * 60 * 60 * 1000,

    w:
      7 * 24 * 60 * 60 * 1000
  };

  return (
    amount *
    multipliers[unit]
  );
}

async function finishContest(id) {

  const contest =
    contests.get(id);

  if (
    !contest ||
    contest.finished
  ) {
    return;
  }

  contest.finished = true;

  let winner = null;

  if (
    contest.participants.size > 0
  ) {

    const users =
      [...contest.participants];

    winner =
      users[
        Math.floor(
          Math.random() *
          users.length
        )
      ];
  }

  const channel =
    await client.channels
      .fetch(contest.channelId)
      .catch(() => null);

  if (!channel) {

    contests.delete(id);
    return;
  }

  const winnerText =
    winner
      ? `<@${winner}>`
      : "Brak uczestników";

  const embed =
    new EmbedBuilder()

      .setColor(0xf1c40f)

      .setTitle(
        "🏆 KONKURS ZAKOŃCZONY!"
      )

      .setDescription(
        `Konkurs na nagrodę **${contest.prize}** właśnie się zakończył!\n\n` +

        `👥 Uczestników: **${contest.participants.size}**\n` +

        `🎁 Nagroda: **${contest.prize}**\n` +

        `🏆 Zwycięzca: ${winnerText}`
      )

      .setFooter({
        text:
          "Ravexmc.pl • Konkurs"
      })

      .setTimestamp();

  await channel.messages
    .fetch(contest.messageId)

    .then(message =>
      message.edit({
        embeds: [embed],
        components: []
      })
    )

    .catch(() => {});

  if (winner) {

    await channel.send(
      `🎉 Gratulacje ${winner}! Wygrałeś/aś **${contest.prize}**!`
    );
  }

  contests.delete(id);
}

// =====================================================
// BACKUP
// =====================================================

function createBackup(guild) {

  const channels =
    guild.channels.cache

      .filter(
        channel =>
          channel.type !==
          ChannelType.GuildCategory
      )

      .map(channel => ({

        name: channel.name,

        type: channel.type,

        topic:
          channel.topic || null,

        parentName:
          channel.parent?.name ||
          null,

        position:
          channel.rawPosition
      }));

  const categories =
    guild.channels.cache

      .filter(
        channel =>
          channel.type ===
          ChannelType.GuildCategory
      )

      .map(category => ({

        name: category.name,

        position:
          category.rawPosition
      }));

  const backup = {

    guildId: guild.id,

    guildName: guild.name,

    createdAt:
      new Date().toISOString(),

    categories,

    channels
  };

  saveJSON(
    backupFile,
    backup
  );

  return backup;
}

// =====================================================
// COMMANDS
// =====================================================

const commands = [

  new SlashCommandBuilder()
    .setName("weryfikacja")
    .setDescription(
      "Zweryfikuj swoje konto na serwerze"
    ),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription(
      "Wyślij panel ticketów"
    ),

  new SlashCommandBuilder()
    .setName("media")
    .setDescription(
      "Informacje o randze MEDIA i TWÓRCA"
    ),

  new SlashCommandBuilder()
    .setName("regulamin")
    .setDescription(
      "Wyświetl regulamin serwera Minecraft"
    ),

  new SlashCommandBuilder()
    .setName("regulamindiscord")
    .setDescription(
      "Wyświetl regulamin Discorda"
    ),

  new SlashCommandBuilder()
    .setName("rekrutacja")
    .setDescription(
      "Wyślij panel rekrutacyjny"
    ),

  new SlashCommandBuilder()
    .setName("konkurs")
    .setDescription(
      "Stwórz konkurs"
    )

    .addStringOption(option =>
      option
        .setName("nagroda")
        .setDescription(
          "Nagroda w konkursie"
        )
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("czas")
        .setDescription(
          "Czas, np. 30m, 2h, 7d"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kolkoikrzyzyk")
    .setDescription(
      "Zagraj w kółko i krzyżyk"
    )

    .addUserOption(option =>
      option
        .setName("przeciwnik")
        .setDescription(
          "Osoba, z którą chcesz zagrać"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(
      "kamienpapiernozyce"
    )
    .setDescription(
      "Zagraj w kamień, papier, nożyce — 3 rundy"
    ),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription(
      "Usuń wiadomości"
    )

    .addIntegerOption(option =>
      option
        .setName("ilosc")
        .setDescription(
          "Ile wiadomości usunąć"
        )
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription(
      "Zbanuj użytkownika"
    )

    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription(
          "Użytkownik"
        )
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("powod")
        .setDescription(
          "Powód bana"
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription(
      "Wyrzuć użytkownika"
    )

    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription(
          "Użytkownik"
        )
        .setRequired(true)
    )

    .addStringOption(option =>
      option
        .setName("powod")
        .setDescription(
          "Powód"
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription(
      "Wycisz użytkownika"
    )

    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription(
          "Użytkownik"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription(
      "Zdejmij wyciszenie"
    )

    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription(
          "Użytkownik"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription(
      "Bot wysyła wiadomość"
    )

    .addStringOption(option =>
      option
        .setName("tekst")
        .setDescription(
          "Treść wiadomości"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription(
      "Informacje o serwerze"
    ),

  new SlashCommandBuilder()
    .setName("zapisz")
    .setDescription(
      "Utwórz backup serwera"
    ),

  new SlashCommandBuilder()
    .setName("backup")
    .setDescription(
      "Wyślij ostatni backup serwera"
    ),

  new SlashCommandBuilder()
    .setName("usun-kanaly")
    .setDescription(
      "Usuń wszystkie kanały po wykonaniu backupu"
    )
];

// =====================================================
// READY
// =====================================================

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log(
      `Zalogowano jako ${readyClient.user.tag}`
    );

    try {

      const guild =
        readyClient.guilds.cache.get(
          config.GUILD_ID
        );

      if (!guild) {

        console.log(
          "Nie znaleziono GUILD_ID. Sprawdź src/config.js."
        );

        return;
      }

      await guild.commands.set(
        commands.map(
          command =>
            command.toJSON()
        )
      );

      console.log(
        "Komendy slash zostały zarejestrowane."
      );

    } catch (error) {

      console.error(
        "Błąd rejestracji komend:",
        error
      );
    }
  }
);

// =====================================================
// WELCOME
// =====================================================

client.on(
  Events.GuildMemberAdd,
  async member => {

    try {

      if (
        !isConfigured(
          config.WELCOME_CHANNEL_ID
        )
      ) {
        return;
      }

      const channel =
        member.guild.channels.cache.get(
          config.WELCOME_CHANNEL_ID
        );

      if (!channel) return;

      const embed =
        new EmbedBuilder()

          .setColor(
            config.EMBED_COLOR
          )

          .setTitle(
            "👋 Witaj na Ravexmc.pl!"
          )

          .setDescription(
            `Witaj ${member}!\n\n` +

            `Miło Cię widzieć na naszym serwerze Minecraft! 🎮\n\n` +

            `🔐 Nie zapomnij przejść weryfikacji.\n` +
            `📜 Zapoznaj się z regulaminem.\n` +
            `🎫 Jeśli potrzebujesz pomocy — utwórz ticket.`
          )

          .setThumbnail(
            member.user.displayAvatarURL()
          )

          .setFooter({
            text:
              "Ravexmc.pl"
          })

          .setTimestamp();

      await channel.send({
        embeds: [embed]
      });

      await sendLog(
        member.guild,
        "👋 Nowy użytkownik",

        `${member.user.tag} dołączył na serwer.`
      );

    } catch (error) {

      console.log(
        "Błąd welcome:",
        error.message
      );
    }
  }
);

// =====================================================
// LEAVE
// =====================================================

client.on(
  Events.GuildMemberRemove,
  async member => {

    await sendLog(
      member.guild,
      "📤 Użytkownik opuścił serwer",

      `${member.user.tag} opuścił serwer.`
    );
  }
);

// =====================================================
// MESSAGE DELETE LOG
// =====================================================

client.on(
  Events.MessageDelete,
  async message => {

    if (!message.guild) return;

    const author =
      message.author
        ? message.author.tag
        : "Nieznany użytkownik";

    const content =
      message.content
        ? message.content.slice(0, 1000)
        : "Brak treści";

    await sendLog(
      message.guild,
      "🗑️ Usunięto wiadomość",

      `**Autor:** ${author}\n` +
      `**Kanał:** ${message.channel}\n` +
      `**Treść:** ${content}`,

      0xe74c3c
    );
  }
);

// =====================================================
// ANTI BOT
// =====================================================

client.on(
  Events.GuildMemberAdd,
  async member => {

    if (!member.user.bot) {
      return;
    }

    try {

      const logs =
        await member.guild.fetchAuditLogs({
          type: 28,
          limit: 5
        });

      const entry =
        logs.entries.find(
          entry =>
            entry.target?.id ===
            member.id
        );

      if (!entry) return;

      if (
        entry.executor?.id ===
        config.OWNER_ID
      ) {

        await sendLog(
          member.guild,
          "🤖 Bot dodany",

          `Bot ${member.user.tag} został dodany przez właściciela.`
        );

        return;
      }

      if (
        member.guild.members.me.permissions.has(
          PermissionsBitField.Flags.KickMembers
        )
      ) {

        await member.kick(
          "Nieautoryzowany bot — automatyczna ochrona"
        );

        await sendLog(
          member.guild,
          "🛡️ Zablokowano bota",

          `Bot ${member.user.tag} został usunięty.\n` +
          `Dodający: ${entry.executor?.tag || "Nieznany"}`,

          0xe74c3c
        );
      }

    } catch (error) {

      console.log(
        "Anti-bot:",
        error.message
      );
    }
  }
);

// =====================================================
// INTERACTIONS
// =====================================================

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      // =================================================
      // SLASH COMMANDS
      // =================================================

      if (
        interaction.isChatInputCommand()
      ) {

        // ===============================================
        // WERYFIKACJA
        // ===============================================

        if (
          interaction.commandName ===
          "weryfikacja"
        ) {

          try {

            if (
              !isConfigured(
                config.VERIFIED_ROLE_ID
              )
            ) {

              return interaction.reply({
                content:
                  "❌ Nie ustawiono `VERIFIED_ROLE_ID` w config.js.",
                ephemeral: true
              });
            }

            const role =
              interaction.guild.roles.cache.get(
                config.VERIFIED_ROLE_ID
              );

            if (!role) {

              return interaction.reply({
                content:
                  "❌ Nie znaleziono roli weryfikacyjnej. Sprawdź `VERIFIED_ROLE_ID`.",
                ephemeral: true
              });
            }

            // Użytkownik już zweryfikowany
            if (
              interaction.member.roles.cache.has(
                role.id
              )
            ) {

              return interaction.reply({
                content:
                  "✅ Jesteś już zweryfikowany!",
                ephemeral: true
              });
            }

            const botMember =
              interaction.guild.members.me;

            if (!botMember) {

              return interaction.reply({
                content:
                  "❌ Nie udało się znaleźć bota na serwerze.",
                ephemeral: true
              });
            }

            if (
              !botMember.permissions.has(
                PermissionsBitField.Flags.ManageRoles
              )
            ) {

              return interaction.reply({
                content:
                  "❌ Bot nie ma uprawnienia **Zarządzanie rolami**.",
                ephemeral: true
              });
            }

            if (
              role.position >=
              botMember.roles.highest.position
            ) {

              return interaction.reply({
                content:
                  "❌ Rola weryfikacyjna znajduje się wyżej lub na tej samej pozycji co najwyższa rola bota.\n\n" +
                  "Przenieś rolę bota **nad rolę weryfikacyjną**.",
                ephemeral: true
              });
            }

            // Losowanie działania
            const question =
              generateMathQuestion();

            // Zapis pytania
            saveVerification(
              interaction.user.id,
              question
            );

            // Modal
            const modal =
              new ModalBuilder()

                .setCustomId(
                  "verification_modal"
                )

                .setTitle(
                  "🔐 Weryfikacja Ravexmc.pl"
                );

            const nickInput =
              new TextInputBuilder()

                .setCustomId(
                  "minecraft_nick"
                )

                .setLabel(
                  "Twój nick Minecraft"
                )

                .setPlaceholder(
                  "Np. RavexPlayer"
                )

                .setStyle(
                  TextInputStyle.Short
                )

                .setRequired(true)

                .setMinLength(3)

                .setMaxLength(16);

            const mathInput =
              new TextInputBuilder()

                .setCustomId(
                  "math_answer"
                )

                .setLabel(
                  `Ile to ${question.question}?`
                )

                .setPlaceholder(
                  "Wpisz wynik"
                )

                .setStyle(
                  TextInputStyle.Short
                )

                .setRequired(true)

                .setMaxLength(5);

            modal.addComponents(

              new ActionRowBuilder()
                .addComponents(
                  nickInput
                ),

              new ActionRowBuilder()
                .addComponents(
                  mathInput
                )
            );

            return interaction.showModal(
              modal
            );

          } catch (error) {

            console.error(
              "Błąd uruchamiania weryfikacji:",
              error
            );

            if (
              !interaction.replied &&
              !interaction.deferred
            ) {

              return interaction.reply({
                content:
                  "❌ Nie udało się uruchomić weryfikacji. Spróbuj ponownie.",
                ephemeral: true
              });
            }
          }
        }

        // ===============================================
        // TICKET
        // ===============================================

        if (
          interaction.commandName ===
          "ticket"
        ) {

          const options =
            Object.entries(
              ticketCategories
            ).map(
              ([value, category]) => ({
                label: category.label,
                description:
                  category.description,
                value,
                emoji: category.emoji
              })
            );

          const embed =
            new EmbedBuilder()

              .setColor(
                config.EMBED_COLOR
              )

              .setTitle(
                "🎫 CENTRUM POMOCY • RAVEXMC.PL"
              )

              .setDescription(
                "Potrzebujesz pomocy? Wybierz odpowiednią kategorię poniżej.\n\n" +

                "📌 **Przed utworzeniem ticketu przygotuj:**\n" +

                "• swój nick Minecraft\n" +
                "• dokładny opis sprawy\n" +
                "• screenshot lub nagranie, jeśli jest potrzebne\n\n" +

                "⚠️ Nie twórz kilku ticketów w tej samej sprawie."
              )

              .setFooter({
                text:
                  "Ravexmc.pl • System pomocy"
              })

              .setTimestamp();

          const menu =
            new StringSelectMenuBuilder()

              .setCustomId(
                "ticket_select"
              )

              .setPlaceholder(
                "🎫 Wybierz kategorię ticketu"
              )

              .addOptions(options);

          return interaction.reply({
            embeds: [embed],

            components: [
              new ActionRowBuilder()
                .addComponents(menu)
            ]
          });
        }

        // ===============================================
        // MEDIA
        // ===============================================

        if (
          interaction.commandName ===
          "media"
        ) {

          const embed =
            new EmbedBuilder()

              .setColor(0xe91e63)

              .setTitle(
                "🎥 RANGA MEDIA • RAVEXMC.PL"
              )

              .setDescription(
                "Chcesz otrzymać rangę **MEDIA**? Spełnij wszystkie wymagania poniżej.\n\n" +

                "### 🎬 WYMAGANIA MEDIA\n" +

                "• Musisz przygotować **4 TikToki**.\n" +
                "• **1 z 4 TikToków musi być związany z naszym serwerem Minecraft**.\n" +
                "• Pozostałe **3 TikToki nie muszą być związane z serwerem**.\n" +
                "• **2 TikToki muszą mieć minimum 25 polubień**.\n" +
                "• **2 TikToki muszą mieć minimum 50 polubień**.\n" +
                "• W opisie każdego TikToka musi znajdować się dokładnie:\n" +
                "`IP serwera: #ravexmc`\n" +
                "• **IP serwera musi być widoczne na ekranie przez cały TikTok**.\n" +
                "• Minimum **1 film musi mieć 2500 wyświetleń**.\n\n" +

                "### 🎫 JAK OTRZYMAĆ RANGĘ?\n" +

                "Po spełnieniu wymagań **nie otrzymasz rangi automatycznie**.\n\n" +

                "Musisz:\n" +
                "1️⃣ Otworzyć ticket.\n" +
                "2️⃣ Wybrać kategorię **Media / Twórca**.\n" +
                "3️⃣ Pokazać administracji wszystkie wymagane TikToki.\n" +
                "4️⃣ Administracja sprawdzi materiały.\n" +
                "5️⃣ Po pozytywnej weryfikacji otrzymasz rangę.\n\n" +

                "━━━━━━━━━━━━━━━━━━━━\n\n" +

                "### ⭐ RANGA TWÓRCA\n" +

                "Ranga **TWÓRCA** jest przeznaczona dla osób regularnie tworzących wartościowe materiały.\n\n" +

                "Aby ubiegać się o rangę TWÓRCA, przygotuj swoje materiały, kanały/profile oraz statystyki i zgłoś się przez **ticket**.\n\n" +

                "Administracja indywidualnie sprawdzi jakość materiałów, aktywność oraz ich zgodność z serwerem.\n\n" +

                "❗ **Ranga MEDIA ani TWÓRCA nie jest nadawana automatycznie.**"
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Media & Twórcy"
              })

              .setTimestamp();

          const row =
            new ActionRowBuilder()
              .addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    "media_ticket"
                  )
                  .setLabel(
                    "Otwórz ticket"
                  )
                  .setEmoji("🎫")
                  .setStyle(
                    ButtonStyle.Primary
                  )
              );

          return interaction.reply({
            embeds: [embed],
            components: [row]
          });
        }

        // ===============================================
        // REGULAMIN MINECRAFT
        // ===============================================

        if (
          interaction.commandName ===
          "regulamin"
        ) {

          const embed =
            new EmbedBuilder()

              .setColor(0x3498db)

              .setTitle(
                "📜 REGULAMIN SERWERA MINECRAFT"
              )

              .setDescription(
                "### §1. Postanowienia ogólne\n" +

                "1. Każdy gracz zobowiązany jest do przestrzegania regulaminu.\n" +
                "2. Nieznajomość regulaminu nie zwalnia z jego przestrzegania.\n" +
                "3. Administracja ma prawo reagować na sytuacje, które szkodzą serwerowi lub społeczności.\n\n" +

                "### §2. Zachowanie na serwerze\n" +

                "1. Zabronione są obrażanie, prowokowanie i celowe wywoływanie konfliktów.\n" +
                "2. Zabronione jest spamowanie i floodowanie.\n" +
                "3. Zabronione jest reklamowanie innych serwerów bez zgody administracji.\n" +
                "4. Zabronione jest wykorzystywanie błędów serwera dla własnych korzyści.\n\n" +

                "### §3. Oszustwa i niedozwolone oprogramowanie\n" +

                "1. Zabronione jest używanie cheatów, wspomagaczy oraz niedozwolonych modyfikacji.\n" +
                "2. Zabronione jest wykorzystywanie bugów i exploitów.\n" +
                "3. Podejrzane zachowania mogą zostać zweryfikowane przez administrację.\n\n" +

                "### §4. Kary\n" +

                "1. Za złamanie regulaminu mogą zostać nałożone odpowiednie kary.\n" +
                "2. Rodzaj kary zależy od przewinienia i jego powagi.\n" +
                "3. Administracja może uwzględnić historię przewinień gracza.\n\n" +

                "### §5. Zgłoszenia\n" +

                "Problemy i zgłoszenia należy kierować do administracji poprzez system ticketów.\n\n" +

                "⚠️ **Regulamin może zostać zmieniony przez administrację.**"
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Regulamin Minecraft"
              })

              .setTimestamp();

          return interaction.reply({
            embeds: [embed]
          });
        }

        // ===============================================
        // REGULAMIN DISCORD
        // ===============================================

        if (
          interaction.commandName ===
          "regulamindiscord"
        ) {

          const embed =
            new EmbedBuilder()

              .setColor(0x5865f2)

              .setTitle(
                "📜 REGULAMIN DISCORD"
              )

              .setDescription(
                "### §1. Kultura\n" +

                "1. Szanuj innych użytkowników.\n" +
                "2. Zabronione są wyzwiska, groźby, nękanie i prowokacje.\n" +
                "3. Nie powoduj celowych konfliktów.\n\n" +

                "### §2. Wiadomości\n" +

                "1. Zakaz spamu i floodowania.\n" +
                "2. Zakaz nadmiernego używania CAPS LOCKA.\n" +
                "3. Korzystaj z kanałów zgodnie z ich przeznaczeniem.\n\n" +

                "### §3. Reklamy\n" +

                "1. Reklamowanie innych serwerów lub usług bez zgody administracji jest zabronione.\n" +
                "2. Zabronione są również reklamy wysyłane na PW użytkowników w związku z serwerem.\n\n" +

                "### §4. Treści\n" +

                "1. Zakazane są treści nielegalne, NSFW oraz materiały mające na celu obrażanie innych.\n" +
                "2. Zabronione jest publikowanie cudzych danych osobowych.\n\n" +

                "### §5. Administracja\n" +

                "1. Decyzje administracji należy respektować.\n" +
                "2. Odwołania i problemy można zgłaszać poprzez ticket.\n" +
                "3. Podszywanie się pod administrację jest zabronione.\n\n" +

                "⚠️ **Nieznajomość regulaminu nie zwalnia z jego przestrzegania.**"
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Regulamin Discord"
              })

              .setTimestamp();

          return interaction.reply({
            embeds: [embed]
          });
        }

        // ===============================================
        // REKRUTACJA
        // ===============================================

        if (
          interaction.commandName ===
          "rekrutacja"
        ) {

          const embed =
            new EmbedBuilder()

              .setColor(0x2ecc71)

              .setTitle(
                "🛡️ REKRUTACJA • RAVEXMC.PL"
              )

              .setDescription(
                "Chcesz dołączyć do naszej administracji?\n\n" +

                "Jeżeli jesteś osobą aktywną, odpowiedzialną i potrafisz pomagać graczom — złóż podanie.\n\n" +

                "### 📋 PRZED ZŁOŻENIEM PODANIA\n" +

                "• odpowiadaj szczerze,\n" +
                "• nie kopiuj odpowiedzi z internetu,\n" +
                "• zadbaj o czytelne odpowiedzi,\n" +
                "• podanie powinno być napisane samodzielnie.\n\n" +

                "### ❓ PYTANIA\n" +

                "Formularz zapyta Cię między innymi o:\n" +

                "👤 wiek\n" +
                "🕐 dostępność\n" +
                "🛠️ doświadczenie\n" +
                "🎯 dlaczego chcesz zostać administratorem\n" +
                "💎 dlaczego wybrałeś Ravexmc.pl\n" +
                "📝 coś o sobie\n" +
                "⚡ czas reakcji na zgłoszenia\n" +
                "🏆 wcześniejsze doświadczenie administracyjne\n\n" +

                "Kliknij przycisk poniżej, aby rozpocząć."
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Rekrutacja"
              })

              .setTimestamp();

          const row =
            new ActionRowBuilder()
              .addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    "recruitment_apply"
                  )
                  .setLabel(
                    "Złóż podanie"
                  )
                  .setEmoji("📨")
                  .setStyle(
                    ButtonStyle.Success
                  )
              );

          return interaction.reply({
            embeds: [embed],
            components: [row]
          });
        }

        // ===============================================
        // KONKURS
        // ===============================================

        if (
          interaction.commandName ===
          "konkurs"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Tylko właściciel bota może tworzyć konkursy.",
              ephemeral: true
            });
          }

          const prize =
            interaction.options.getString(
              "nagroda"
            );

          const durationText =
            interaction.options.getString(
              "czas"
            );

          const duration =
            parseDuration(
              durationText
            );

          if (!duration) {

            return interaction.reply({
              content:
                "❌ Nieprawidłowy czas.\n\nPrzykłady: `30m`, `2h`, `7d`, `1w`.",
              ephemeral: true
            });
          }

          if (duration < 10000) {

            return interaction.reply({
              content:
                "❌ Konkurs musi trwać minimum 10 sekund.",
              ephemeral: true
            });
          }

          const id =
            `${interaction.guild.id}_${Date.now()}`;

          const contest = {

            id,

            prize,

            channelId:
              interaction.channel.id,

            messageId: null,

            participants:
              new Set(),

            finished: false,

            endAt:
              Date.now() + duration
          };

          const endTimestamp =
            Math.floor(
              contest.endAt / 1000
            );

          const embed =
            new EmbedBuilder()

              .setColor(0xf1c40f)

              .setTitle(
                "🎉 KONKURS RAVEXMC.PL"
              )

              .setDescription(
                `## 🎁 Nagroda\n` +

                `**${prize}**\n\n` +

                `⏰ **Koniec:** <t:${endTimestamp}:R>\n` +

                `📅 **Dokładna data:** <t:${endTimestamp}:F>\n\n` +

                `👥 **Uczestnicy:** 0\n\n` +

                `Kliknij przycisk **WEŹ UDZIAŁ**, aby dołączyć do konkursu!\n\n` +

                `🍀 Powodzenia wszystkim!`
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Konkurs"
              })

              .setTimestamp();

          const row =
            new ActionRowBuilder()
              .addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    `contest_join_${id}`
                  )
                  .setLabel(
                    "Weź udział"
                  )
                  .setEmoji("🎉")
                  .setStyle(
                    ButtonStyle.Success
                  )
              );

          const message =
            await interaction.channel.send({
              embeds: [embed],
              components: [row]
            });

          contest.messageId =
            message.id;

          contests.set(
            id,
            contest
          );

          await interaction.reply({
            content:
              "✅ Konkurs został utworzony!",
            ephemeral: true
          });

          const schedule =
            async () => {

              const current =
                contests.get(id);

              if (
                !current ||
                current.finished
              ) {
                return;
              }

              const remaining =
                current.endAt -
                Date.now();

              if (remaining <= 0) {

                await finishContest(id);

                return;
              }

              setTimeout(
                schedule,
                Math.min(
                  remaining,
                  2147483647
                )
              );
            };

          schedule();

          return;
        }

        // ===============================================
        // TTT
        // ===============================================

        if (
          interaction.commandName ===
          "kolkoikrzyzyk"
        ) {

          const opponent =
            interaction.options.getUser(
              "przeciwnik"
            );

          if (!opponent) {

            return interaction.reply({
              content:
                "❌ Nie znaleziono przeciwnika.",
              ephemeral: true
            });
          }

          if (opponent.bot) {

            return interaction.reply({
              content:
                "❌ Nie możesz grać z botem.",
              ephemeral: true
            });
          }

          if (
            opponent.id ===
            interaction.user.id
          ) {

            return interaction.reply({
              content:
                "❌ Nie możesz zagrać sam ze sobą.",
              ephemeral: true
            });
          }

          const gameId =
            `${Date.now()}_${interaction.user.id}`;

          const game = {

            id: gameId,

            playerX:
              interaction.user.id,

            playerO:
              opponent.id,

            board:
              Array(9).fill(null),

            turn:
              interaction.user.id,

            finished: false,

            channelId:
              interaction.channel.id
          };

          ticTacToeGames.set(
            gameId,
            game
          );

          const embed =
            new EmbedBuilder()

              .setColor(
                config.EMBED_COLOR
              )

              .setTitle(
                "🎮 KÓŁKO I KRZYŻYK"
              )

              .setDescription(
                `${interaction.user} **❌** vs ${opponent} **⭕**\n\n` +

                `🎯 Zaczyna: ${interaction.user}\n\n` +

                `Kliknij pole, aby wykonać ruch.`
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Kółko i krzyżyk"
              })

              .setTimestamp();

          await interaction.reply({
            embeds: [embed],
            components:
              createTicTacToeBoard(game)
          });

          setTimeout(() => {

            const current =
              ticTacToeGames.get(
                gameId
              );

            if (
              current &&
              !current.finished
            ) {

              current.finished =
                true;

              ticTacToeGames.delete(
                gameId
              );
            }

          }, 10 * 60 * 1000);

          return;
        }

        // ===============================================
        // RPS
        // ===============================================

        if (
          interaction.commandName ===
          "kamienpapiernozyce"
        ) {

          const gameId =
            `${Date.now()}_${interaction.user.id}`;

          const game = {

            id: gameId,

            playerId:
              interaction.user.id,

            round: 1,

            playerScore: 0,

            botScore: 0,

            draws: 0,

            history: [],

            finished: false
          };

          rpsGames.set(
            gameId,
            game
          );

          const embed =
            new EmbedBuilder()

              .setColor(0x9b59b6)

              .setTitle(
                "🪨 📄 ✂️ KAMIEŃ • PAPIER • NOŻYCE"
              )

              .setDescription(
                `### 🏆 Gra do 3 rund\n\n` +

                `👤 ${interaction.user}\n` +
                `🤖 RavexBot\n\n` +

                `**Runda 1 / 3**\n\n` +

                `Wybierz swój ruch poniżej!\n\n` +

                `📊 Wynik: **0 : 0**`
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Kamień Papier Nożyce"
              })

              .setTimestamp();

          return interaction.reply({
            embeds: [embed],

            components: [
              rpsButtons(game)
            ]
          });
        }

        // ===============================================
        // CLEAR
        // ===============================================

        if (
          interaction.commandName ===
          "clear"
        ) {

          if (
            !interaction.member.permissions.has(
              PermissionsBitField.Flags.ManageMessages
            )
          ) {

            return interaction.reply({
              content:
                "❌ Nie masz uprawnienia **Zarządzanie wiadomościami**.",
              ephemeral: true
            });
          }

          const amount =
            interaction.options.getInteger(
              "ilosc"
            );

          await interaction.channel.bulkDelete(
            amount,
            true
          );

          return interaction.reply({
            content:
              `🧹 Usunięto **${amount}** wiadomości.`,
            ephemeral: true
          });
        }

        // ===============================================
        // BAN
        // ===============================================

        if (
          interaction.commandName ===
          "ban"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Nie masz uprawnień do tej komendy.",
              ephemeral: true
            });
          }

          const user =
            interaction.options.getUser(
              "uzytkownik"
            );

          const reason =
            interaction.options.getString(
              "powod"
            ) ||
            "Brak podanego powodu";

          const member =
            await interaction.guild.members
              .fetch(user.id)
              .catch(() => null);

          if (!member) {

            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika na serwerze.",
              ephemeral: true
            });
          }

          await member.ban({
            reason
          });

          await sendLog(
            interaction.guild,
            "🔨 BAN",

            `Użytkownik: ${user}\n` +
            `Moderator: ${interaction.user}\n` +
            `Powód: ${reason}`,

            0xe74c3c
          );

          return interaction.reply({
            content:
              `🔨 Zbanowano ${user}.\nPowód: **${reason}**`
          });
        }

        // ===============================================
        // KICK
        // ===============================================

        if (
          interaction.commandName ===
          "kick"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Nie masz uprawnień do tej komendy.",
              ephemeral: true
            });
          }

          const user =
            interaction.options.getUser(
              "uzytkownik"
            );

          const reason =
            interaction.options.getString(
              "powod"
            ) ||
            "Brak podanego powodu";

          const member =
            await interaction.guild.members
              .fetch(user.id)
              .catch(() => null);

          if (!member) {

            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika.",
              ephemeral: true
            });
          }

          await member.kick(
            reason
          );

          await sendLog(
            interaction.guild,
            "👢 KICK",

            `Użytkownik: ${user}\n` +
            `Moderator: ${interaction.user}\n` +
            `Powód: ${reason}`,

            0xe67e22
          );

          return interaction.reply({
            content:
              `👢 Wyrzucono ${user}.\nPowód: **${reason}**`
          });
        }

        // ===============================================
        // MUTE
        // ===============================================

        if (
          interaction.commandName ===
          "mute"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Nie masz uprawnień do tej komendy.",
              ephemeral: true
            });
          }

          const user =
            interaction.options.getUser(
              "uzytkownik"
            );

          const member =
            await interaction.guild.members
              .fetch(user.id)
              .catch(() => null);

          if (!member) {

            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika.",
              ephemeral: true
            });
          }

          let mutedRole =
            interaction.guild.roles.cache.find(
              role =>
                role.name === "Muted"
            );

          if (!mutedRole) {

            mutedRole =
              await interaction.guild.roles.create({
                name: "Muted",
                reason:
                  "Rola do wyciszeń"
              });
          }

          await member.roles.add(
            mutedRole,
            "Mute przez bota"
          );

          await sendLog(
            interaction.guild,
            "🔇 MUTE",

            `Użytkownik: ${user}\n` +
            `Moderator: ${interaction.user}`,

            0xe67e22
          );

          return interaction.reply({
            content:
              `🔇 Wyciszono ${user}.`
          });
        }

        // ===============================================
        // UNMUTE
        // ===============================================

        if (
          interaction.commandName ===
          "unmute"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Nie masz uprawnień do tej komendy.",
              ephemeral: true
            });
          }

          const user =
            interaction.options.getUser(
              "uzytkownik"
            );

          const member =
            await interaction.guild.members
              .fetch(user.id)
              .catch(() => null);

          if (!member) {

            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika.",
              ephemeral: true
            });
          }

          const mutedRole =
            interaction.guild.roles.cache.find(
              role =>
                role.name === "Muted"
            );

          if (mutedRole) {

            await member.roles.remove(
              mutedRole,
              "Unmute przez bota"
            );
          }

          return interaction.reply({
            content:
              `🔊 Odciszono ${user}.`
          });
        }

        // ===============================================
        // SAY
        // ===============================================

        if (
          interaction.commandName ===
          "say"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Nie masz uprawnień do tej komendy.",
              ephemeral: true
            });
          }

          const text =
            interaction.options.getString(
              "tekst"
            );

          await interaction.channel.send(
            text
          );

          return interaction.reply({
            content:
              "✅ Wysłano wiadomość.",
            ephemeral: true
          });
        }

        // ===============================================
        // SERVER INFO
        // ===============================================

        if (
          interaction.commandName ===
          "serverinfo"
        ) {

          const guild =
            interaction.guild;

          const embed =
            new EmbedBuilder()

              .setColor(
                config.EMBED_COLOR
              )

              .setTitle(
                `📊 ${guild.name}`
              )

              .setDescription(
                `👥 **Członkowie:** ${guild.memberCount}\n` +
                `📁 **Kanały:** ${guild.channels.cache.size}\n` +
                `🎭 **Role:** ${guild.roles.cache.size}\n` +
                `🆔 **ID:** ${guild.id}\n` +
                `📅 **Utworzono:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`
              )

              .setThumbnail(
                guild.iconURL({
                  dynamic: true
                })
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Server Info"
              })

              .setTimestamp();

          return interaction.reply({
            embeds: [embed]
          });
        }

        // ===============================================
        // ZAPISZ
        // ===============================================

        if (
          interaction.commandName ===
          "zapisz"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Tylko właściciel może wykonać backup.",
              ephemeral: true
            });
          }

          const backup =
            createBackup(
              interaction.guild
            );

          return interaction.reply({
            content:
              `✅ Backup wykonany!\n` +
              `📁 Kanałów: **${backup.channels.length}**\n` +
              `📂 Kategorii: **${backup.categories.length}**`
          });
        }

        // ===============================================
        // BACKUP
        // ===============================================

        if (
          interaction.commandName ===
          "backup"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Tylko właściciel może wykonać tę operację.",
              ephemeral: true
            });
          }

          if (
            !fs.existsSync(
              backupFile
            )
          ) {

            return interaction.reply({
              content:
                "❌ Nie ma jeszcze żadnego backupu.",
              ephemeral: true
            });
          }

          const attachment =
            new AttachmentBuilder(
              backupFile,
              {
                name:
                  "ravexmc-backup.json"
              }
            );

          return interaction.reply({
            content:
              "📦 Oto ostatni backup serwera:",

            files: [
              attachment
            ],

            ephemeral: true
          });
        }

        // ===============================================
        // USUŃ KANAŁY
        // ===============================================

        if (
          interaction.commandName ===
          "usun-kanaly"
        ) {

          if (
            !isOwner(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Tylko właściciel może usunąć kanały.",
              ephemeral: true
            });
          }

          await interaction.deferReply({
            ephemeral: true
          });

          createBackup(
            interaction.guild
          );

          const channels =
            [
              ...interaction.guild.channels.cache.values()
            ]
              .filter(
                channel =>
                  channel.deletable &&
                  channel.id !==
                    interaction.channel.id
              );

          for (
            const channel of channels
          ) {

            await channel
              .delete(
                "Usuwanie kanałów po wykonaniu backupu"
              )
              .catch(() => {});
          }

          return interaction.editReply({
            content:
              "🗑️ Kanały zostały usunięte. Backup został zapisany."
          });
        }
      }

      // =================================================
      // TICKET SELECT
      // =================================================

      if (
        interaction.isStringSelectMenu()
      ) {

        if (
          interaction.customId ===
          "ticket_select"
        ) {

          const categoryKey =
            interaction.values[0];

          return createTicket(
            interaction,
            categoryKey
          );
        }
      }

      // =================================================
      // BUTTONS
      // =================================================

      if (
        interaction.isButton()
      ) {

        // ===============================================
        // MEDIA -> TICKET
        // ===============================================

        if (
          interaction.customId ===
          "media_ticket"
        ) {

          return createTicket(
            interaction,
            "ticket_media"
          );
        }

        // ===============================================
        // REKRUTACJA
        // ===============================================

        if (
          interaction.customId ===
          "recruitment_apply"
        ) {

          const modal =
            new ModalBuilder()

              .setCustomId(
                "recruitment_modal"
              )

              .setTitle(
                "📨 Podanie • Ravexmc.pl"
              );

          const age =
            new TextInputBuilder()

              .setCustomId(
                "recruit_age"
              )

              .setLabel(
                "Ile masz lat?"
              )

              .setPlaceholder(
                "Np. 16"
              )

              .setStyle(
                TextInputStyle.Short
              )

              .setRequired(true)

              .setMaxLength(3);

          const experience =
            new TextInputBuilder()

              .setCustomId(
                "recruit_experience"
              )

              .setLabel(
                "Jakie masz doświadczenie?"
              )

              .setPlaceholder(
                "Opisz swoje wcześniejsze doświadczenie..."
              )

              .setStyle(
                TextInputStyle.Paragraph
              )

              .setRequired(true)

              .setMaxLength(1000);

          const whyUs =
            new TextInputBuilder()

              .setCustomId(
                "recruit_why"
              )

              .setLabel(
                "Dlaczego chcesz dołączyć?"
              )

              .setPlaceholder(
                "Dlaczego chcesz zostać częścią administracji?"
              )

              .setStyle(
                TextInputStyle.Paragraph
              )

              .setRequired(true)

              .setMaxLength(1000);

          const whyServer =
            new TextInputBuilder()

              .setCustomId(
                "recruit_server"
              )

              .setLabel(
                "Dlaczego akurat Ravexmc.pl?"
              )

              .setPlaceholder(
                "Co podoba Ci się w naszym serwerze?"
              )

              .setStyle(
                TextInputStyle.Paragraph
              )

              .setRequired(true)

              .setMaxLength(1000);

          const about =
            new TextInputBuilder()

              .setCustomId(
                "recruit_about"
              )

              .setLabel(
                "Napisz coś o sobie"
              )

              .setPlaceholder(
                "Przedstaw się i napisz coś więcej o sobie..."
              )

              .setStyle(
                TextInputStyle.Paragraph
              )

              .setRequired(true)

              .setMaxLength(1500);

          modal.addComponents(

            new ActionRowBuilder()
              .addComponents(age),

            new ActionRowBuilder()
              .addComponents(
                experience
              ),

            new ActionRowBuilder()
              .addComponents(
                whyUs
              ),

            new ActionRowBuilder()
              .addComponents(
                whyServer
              ),

            new ActionRowBuilder()
              .addComponents(
                about
              )
          );

          return interaction.showModal(
            modal
          );
        }

        // ===============================================
        // TICKET CLAIM
        // ===============================================

        if (
          interaction.customId ===
          "ticket_claim"
        ) {

          if (
            !memberCanManageTicket(
              interaction.member
            )
          ) {

            return interaction.reply({
              content:
                "❌ Tylko administracja może przejąć ticket.",
              ephemeral: true
            });
          }

          await interaction.reply({
            content:
              `👋 Ticket został przejęty przez ${interaction.user}.`
          });

          await sendLog(
            interaction.guild,
            "👋 Ticket przejęty",

            `Kanał: ${interaction.channel}\n` +
            `Przejął: ${interaction.user}`
          );

          return;
        }

        // ===============================================
        // TICKET CLOSE
        // ===============================================

        if (
          interaction.customId ===
          "ticket_close"
        ) {

          if (
            !interaction.channel.name.startsWith(
              "ticket-"
            )
          ) {

            return interaction.reply({
              content:
                "❌ To nie jest kanał ticketu.",
              ephemeral: true
            });
          }

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
              "🔒 Ticket zostanie zamknięty za 5 sekund..."
          });

          await sendLog(
            interaction.guild,
            "🔒 Ticket zamknięty",

            `Kanał: ${interaction.channel}\n` +
            `Zamknął: ${interaction.user}`
          );

          setTimeout(() => {

            interaction.channel
              .delete(
                "Zamknięcie ticketu"
              )
              .catch(() => {});

          }, 5000);

          return;
        }

        // ===============================================
        // CONTEST
        // ===============================================

        if (
          interaction.customId.startsWith(
            "contest_join_"
          )
        ) {

          const id =
            interaction.customId.replace(
              "contest_join_",
              ""
            );

          const contest =
            contests.get(id);

          if (
            !contest ||
            contest.finished
          ) {

            return interaction.reply({
              content:
                "❌ Ten konkurs już się zakończył.",
              ephemeral: true
            });
          }

          if (
            contest.participants.has(
              interaction.user.id
            )
          ) {

            return interaction.reply({
              content:
                "❌ Już bierzesz udział w tym konkursie!",
              ephemeral: true
            });
          }

          contest.participants.add(
            interaction.user.id
          );

          const endTimestamp =
            Math.floor(
              contest.endAt / 1000
            );

          const embed =
            new EmbedBuilder()

              .setColor(0xf1c40f)

              .setTitle(
                "🎉 KONKURS RAVEXMC.PL"
              )

              .setDescription(
                `## 🎁 Nagroda\n` +

                `**${contest.prize}**\n\n` +

                `⏰ **Koniec:** <t:${endTimestamp}:R>\n` +

                `📅 **Dokładna data:** <t:${endTimestamp}:F>\n\n` +

                `👥 **Uczestnicy:** ${contest.participants.size}\n\n` +

                `Kliknij przycisk **WEŹ UDZIAŁ**, aby dołączyć do konkursu!\n\n` +

                `🍀 Powodzenia wszystkim!`
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Konkurs"
              })

              .setTimestamp();

          const row =
            new ActionRowBuilder()
              .addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    `contest_join_${id}`
                  )
                  .setLabel(
                    "Weź udział"
                  )
                  .setEmoji("🎉")
                  .setStyle(
                    ButtonStyle.Success
                  )
              );

          const message =
            await interaction.channel.messages
              .fetch(
                contest.messageId
              )
              .catch(() => null);

          if (message) {

            await message.edit({
              embeds: [embed],
              components: [row]
            });
          }

          return interaction.reply({
            content:
              "🎉 Zostałeś dodany do konkursu!",
            ephemeral: true
          });
        }

        // ===============================================
        // TTT
        // ===============================================

        if (
          interaction.customId.startsWith(
            "ttt_"
          )
        ) {

          const parts =
            interaction.customId.split(
              "_"
            );

          const gameId =
            parts[1];

          const position =
            Number(parts[2]);

          const game =
            ticTacToeGames.get(
              gameId
            );

          if (
            !game ||
            game.finished
          ) {

            return interaction.reply({
              content:
                "❌ Ta gra już się zakończyła.",
              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
              game.playerX &&
            interaction.user.id !==
              game.playerO
          ) {

            return interaction.reply({
              content:
                "❌ Nie jesteś uczestnikiem tej gry.",
              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
            game.turn
          ) {

            return interaction.reply({
              content:
                "⏳ Teraz jest kolej przeciwnika.",
              ephemeral: true
            });
          }

          if (
            game.board[position]
          ) {

            return interaction.reply({
              content:
                "❌ To pole jest już zajęte.",
              ephemeral: true
            });
          }

          const symbol =
            interaction.user.id ===
            game.playerX
              ? "❌"
              : "⭕";

          game.board[position] =
            symbol;

          const result =
            checkTicTacToeWinner(
              game.board
            );

          if (result) {

            game.finished = true;

            let text;

            if (
              result === "DRAW"
            ) {

              text =
                "🤝 **REMIS!**";

            } else {

              const winner =
                result === "❌"
                  ? game.playerX
                  : game.playerO;

              text =
                `🏆 Wygrywa <@${winner}> ${result}!`;
            }

            const embed =
              new EmbedBuilder()

                .setColor(
                  result === "DRAW"
                    ? 0xf1c40f
                    : 0x2ecc71
                )

                .setTitle(
                  "🎮 KÓŁKO I KRZYŻYK"
                )

                .setDescription(
                  `<@${game.playerX}> **❌** vs <@${game.playerO}> **⭕**\n\n` +

                  text +

                  `\n\n⏱️ Gra zakończona.`
                )

                .setFooter({
                  text:
                    "Ravexmc.pl • Kółko i krzyżyk"
                })

                .setTimestamp();

            ticTacToeGames.delete(
              gameId
            );

            return interaction.update({
              embeds: [embed],

              components:
                createTicTacToeBoard(
                  game
                )
            });
          }

          game.turn =
            interaction.user.id ===
              game.playerX
              ? game.playerO
              : game.playerX;

          const embed =
            new EmbedBuilder()

              .setColor(
                config.EMBED_COLOR
              )

              .setTitle(
                "🎮 KÓŁKO I KRZYŻYK"
              )

              .setDescription(
                `<@${game.playerX}> **❌** vs <@${game.playerO}> **⭕**\n\n` +

                `🎯 Teraz ruch: <@${game.turn}>`
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Kółko i krzyżyk"
              })

              .setTimestamp();

          return interaction.update({
            embeds: [embed],

            components:
              createTicTacToeBoard(
                game
              )
          });
        }

        // ===============================================
        // RPS
        // ===============================================

        if (
          interaction.customId.startsWith(
            "rps_"
          )
        ) {

          const parts =
            interaction.customId.split(
              "_"
            );

          const gameId =
            parts[1];

          const playerChoice =
            parts[2];

          const game =
            rpsGames.get(
              gameId
            );

          if (
            !game ||
            game.finished
          ) {

            return interaction.reply({
              content:
                "❌ Ta gra już się zakończyła.",
              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
            game.playerId
          ) {

            return interaction.reply({
              content:
                "❌ To nie jest Twoja gra.",
              ephemeral: true
            });
          }

          const choices =
            Object.keys(
              rpsChoices
            );

          const botChoice =
            choices[
              Math.floor(
                Math.random() *
                choices.length
              )
            ];

          const result =
            rpsWinner(
              playerChoice,
              botChoice
            );

          if (
            result === "PLAYER"
          ) {

            game.playerScore++;

          } else if (
            result === "BOT"
          ) {

            game.botScore++;

          } else {

            game.draws++;
          }

          game.history.push({

            round:
              game.round,

            playerChoice,

            botChoice,

            result
          });

          const playerText =
            `${rpsChoices[playerChoice].emoji} ${rpsChoices[playerChoice].label}`;

          const botText =
            `${rpsChoices[botChoice].emoji} ${rpsChoices[botChoice].label}`;

          let resultText;

          if (
            result === "PLAYER"
          ) {

            resultText =
              "🟢 Wygrywasz tę rundę!";

          } else if (
            result === "BOT"
          ) {

            resultText =
              "🔴 Bot wygrywa tę rundę!";

          } else {

            resultText =
              "🟡 Remis w tej rundzie!";
          }

          if (
            game.round >= 3
          ) {

            game.finished = true;

            let finalText;

            if (
              game.playerScore >
              game.botScore
            ) {

              finalText =
                `🏆 **WYGRYWASZ CAŁĄ GRĘ!** 🎉\n\n` +
                `Gratulacje ${interaction.user}!`;

            } else if (
              game.botScore >
              game.playerScore
            ) {

              finalText =
                `🤖 **BOT WYGRYWA CAŁĄ GRĘ!**\n\n` +
                `Spróbuj ponownie!`;

            } else {

              finalText =
                `🤝 **REMIS!**\n\n` +
                `Nikt nie wygrał całej gry.`;
            }

            const historyText =
              game.history
                .map(
                  round =>
                    `**Runda ${round.round}:** ${rpsChoices[round.playerChoice].emoji} vs ${rpsChoices[round.botChoice].emoji}`
                )
                .join("\n");

            const embed =
              new EmbedBuilder()

                .setColor(
                  0x9b59b6
                )

                .setTitle(
                  "🏆 KAMIEŃ • PAPIER • NOŻYCE — KONIEC"
                )

                .setDescription(
                  `👤 ${interaction.user}\n` +
                  `🤖 RavexBot\n\n` +

                  `### 📊 KOŃCOWY WYNIK\n` +

                  `👤 **${game.playerScore}** : **${game.botScore}** 🤖\n\n` +

                  `${finalText}\n\n` +

                  `### 📜 HISTORIA RUND\n` +
                  historyText
                )

                .setFooter({
                  text:
                    "Ravexmc.pl • Gra zakończona"
                })

                .setTimestamp();

            rpsGames.delete(
              gameId
            );

            return interaction.update({
              embeds: [embed],

              components: [
                rpsButtons({
                  ...game,
                  finished: true
                })
              ]
            });
          }

          game.round++;

          const embed =
            new EmbedBuilder()

              .setColor(
                0x9b59b6
              )

              .setTitle(
                "🪨 📄 ✂️ KAMIEŃ • PAPIER • NOŻYCE"
              )

              .setDescription(
                `👤 ${interaction.user}\n` +
                `🤖 RavexBot\n\n` +

                `### 🎯 Runda ${game.round - 1} / 3\n\n` +

                `👤 Twój wybór: **${playerText}**\n` +
                `🤖 Bot: **${botText}**\n\n` +

                `${resultText}\n\n` +

                `### 📊 Wynik\n` +

                `👤 **${game.playerScore}** : **${game.botScore}** 🤖\n\n` +

                `### 🎮 Runda ${game.round} / 3\n` +

                `Wybierz następny ruch!`
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Kamień Papier Nożyce"
              })

              .setTimestamp();

          return interaction.update({
            embeds: [embed],

            components: [
              rpsButtons(game)
            ]
          });
        }
      }

      // =================================================
      // MODALS
      // =================================================

      if (
        interaction.isModalSubmit()
      ) {

        // ===============================================
        // WERYFIKACJA
        // ===============================================

        if (
          interaction.customId ===
          "verification_modal"
        ) {

          /*
           * WAŻNE:
           * Odpowiadamy Discordowi NATYCHMIAST.
           * Dzięki temu operacje:
           * - nadanie roli
           * - zmiana nicku
           * - wysłanie logu
           * nie spowodują timeoutu.
           */

          await interaction.deferReply({
            ephemeral: true
          });

          try {

            // -------------------------------------------
            // POBRANIE DANYCH
            // -------------------------------------------

            const nick =
              interaction.fields
                .getTextInputValue(
                  "minecraft_nick"
                )
                .trim();

            const answer =
              interaction.fields
                .getTextInputValue(
                  "math_answer"
                )
                .trim();

            // -------------------------------------------
            // SPRAWDZENIE NICKU MINECRAFT
            // -------------------------------------------

            const minecraftNickRegex =
              /^[A-Za-z0-9_]{3,16}$/;

            if (
              !minecraftNickRegex.test(
                nick
              )
            ) {

              return interaction.editReply({
                content:
                  "❌ **Nieprawidłowy nick Minecraft!**\n\n" +

                  "Nick może zawierać tylko:\n" +
                  "• litery\n" +
                  "• cyfry\n" +
                  "• znak `_`\n\n" +

                  "Długość: **3–16 znaków**."
              });
            }

            // -------------------------------------------
            // POBRANIE PYTANIA
            // -------------------------------------------

            const question =
              verificationQuestions.get(
                interaction.user.id
              );

            if (!question) {

              return interaction.editReply({
                content:
                  "❌ **Weryfikacja wygasła.**\n\n" +
                  "Uruchom ponownie `/weryfikacja`."
              });
            }

            // -------------------------------------------
            // SPRAWDZENIE MATEMATYKI
            // -------------------------------------------

            const numericAnswer =
              Number(answer);

            if (
              !Number.isInteger(
                numericAnswer
              ) ||
              numericAnswer !==
                question.answer
            ) {

              verificationQuestions.delete(
                interaction.user.id
              );

              return interaction.editReply({
                content:
                  "❌ **Nieprawidłowy wynik działania!**\n\n" +

                  `Działanie: **${question.question}**\n\n` +

                  "Uruchom ponownie `/weryfikacja`."
              });
            }

            // -------------------------------------------
            // POBRANIE ROLI
            // -------------------------------------------

            const role =
              interaction.guild.roles.cache.get(
                config.VERIFIED_ROLE_ID
              );

            if (!role) {

              verificationQuestions.delete(
                interaction.user.id
              );

              return interaction.editReply({
                content:
                  "❌ Nie znaleziono roli weryfikacyjnej.\n\n" +
                  "Administracja musi sprawdzić `VERIFIED_ROLE_ID` w config.js."
              });
            }

            // -------------------------------------------
            // POBRANIE BOTA
            // -------------------------------------------

            const botMember =
              interaction.guild.members.me;

            if (!botMember) {

              return interaction.editReply({
                content:
                  "❌ Nie udało się znaleźć bota na serwerze."
              });
            }

            // -------------------------------------------
            // SPRAWDZENIE UPRAWNIEŃ
            // -------------------------------------------

            if (
              !botMember.permissions.has(
                PermissionsBitField.Flags.ManageRoles
              )
            ) {

              return interaction.editReply({
                content:
                  "❌ Bot nie ma uprawnienia **Zarządzanie rolami**."
              });
            }

            // -------------------------------------------
            // HIERARCHIA RÓL
            // -------------------------------------------

            if (
              role.position >=
              botMember.roles.highest.position
            ) {

              return interaction.editReply({
                content:
                  "❌ **Bot nie może nadać tej roli!**\n\n" +

                  "Przenieś najwyższą rolę bota **nad rolę weryfikacyjną**."
              });
            }

            // -------------------------------------------
            // SPRAWDZENIE CZY JUŻ MA ROLĘ
            // -------------------------------------------

            if (
              interaction.member.roles.cache.has(
                role.id
              )
            ) {

              verificationQuestions.delete(
                interaction.user.id
              );

              return interaction.editReply({
                content:
                  "✅ Jesteś już zweryfikowany!"
              });
            }

            // -------------------------------------------
            // NADANIE ROLI
            // -------------------------------------------

            await interaction.member.roles.add(
              role,
              `Pomyślna weryfikacja Minecraft: ${nick}`
            );

            // -------------------------------------------
            // USTAWIENIE NICKU
            // -------------------------------------------

            let nicknameChanged =
              false;

            try {

              /*
               * Nie próbujemy zmieniać nicku właściciela
               * serwera, ponieważ Discord może tego zabronić.
               */

              if (
                interaction.guild.ownerId !==
                interaction.user.id
              ) {

                if (
                  botMember.permissions.has(
                    PermissionsBitField.Flags.ManageNicknames
                  )
                ) {

                  await interaction.member.setNickname(
                    nick,
                    "Nick Minecraft po weryfikacji"
                  );

                  nicknameChanged =
                    true;
                }
              }

            } catch (nicknameError) {

              console.log(
                "Nie udało się zmienić nicku:",
                nicknameError.message
              );
            }

            // -------------------------------------------
            // USUNIĘCIE PYTANIA
            // -------------------------------------------

            verificationQuestions.delete(
              interaction.user.id
            );

            // -------------------------------------------
            // LOG
            // -------------------------------------------

            await sendLog(

              interaction.guild,

              "✅ Pomyślna weryfikacja",

              `**Użytkownik:** ${interaction.user}\n` +

              `**Discord ID:** \`${interaction.user.id}\`\n` +

              `**Nick Minecraft:** \`${nick}\`\n` +

              `**Otrzymana rola:** ${role}\n` +

              `**Pseudonim zmieniony:** ${
                nicknameChanged
                  ? "Tak ✅"
                  : "Nie ❌"
              }`,

              0x2ecc71
            );

            // -------------------------------------------
            // SUKCES
            // -------------------------------------------

            return interaction.editReply({
              content:

                "## ✅ WERYFIKACJA ZAKOŃCZONA!\n\n" +

                `🎮 **Nick Minecraft:** \`${nick}\`\n` +

                `🛡️ **Otrzymana rola:** ${role}\n` +

                `🏷️ **Pseudonim:** ${
                  nicknameChanged
                    ? "Ustawiony ✅"
                    : "Nie udało się ustawić ⚠️"
                }\n\n` +

                "🎉 **Witamy na Ravexmc.pl!**"
            });

          } catch (error) {

            console.error(
              "Błąd podczas weryfikacji:",
              error
            );

            return interaction.editReply({
              content:

                "❌ **Wystąpił błąd podczas weryfikacji.**\n\n" +

                "Sprawdź, czy bot ma:\n" +
                "• uprawnienie **Zarządzanie rolami**\n" +
                "• rolę znajdującą się nad rolą weryfikacyjną\n" +
                "• uprawnienie **Zarządzanie pseudonimami**\n\n" +

                "Jeżeli problem nadal występuje, sprawdź logi Render."
            });
          }
        }

        // ===============================================
        // REKRUTACJA
        // ===============================================

        if (
          interaction.customId ===
          "recruitment_modal"
        ) {

          const age =
            interaction.fields
              .getTextInputValue(
                "recruit_age"
              );

          const experience =
            interaction.fields
              .getTextInputValue(
                "recruit_experience"
              );

          const why =
            interaction.fields
              .getTextInputValue(
                "recruit_why"
              );

          const whyServer =
            interaction.fields
              .getTextInputValue(
                "recruit_server"
              );

          const about =
            interaction.fields
              .getTextInputValue(
                "recruit_about"
              );

          const guild =
            interaction.guild;

          const existing =
            guild.channels.cache.find(
              channel =>
                channel.name ===
                `podanie-${interaction.user.id}`
            );

          if (existing) {

            return interaction.reply({
              content:
                `❌ Masz już otwarte podanie: ${existing}`,
              ephemeral: true
            });
          }

          const recruitmentCategory =
            guild.channels.cache.get(
              config.TICKET_CATEGORY_ID
            );

          if (
            !recruitmentCategory ||
            recruitmentCategory.type !==
              ChannelType.GuildCategory
          ) {

            return interaction.reply({
              content:
                "❌ Nie znaleziono kategorii, w której można utworzyć podanie. Sprawdź `TICKET_CATEGORY_ID`.",
              ephemeral: true
            });
          }

          const permissions = [

            {
              id:
                guild.roles.everyone.id,

              deny: [
                PermissionsBitField.Flags.ViewChannel
              ]
            },

            {
              id:
                interaction.user.id,

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

            permissions.push({

              id: roleId,

              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageMessages
              ]
            });
          }

          const channel =
            await guild.channels.create({

              name:
                `podanie-${interaction.user.id}`,

              type:
                ChannelType.GuildText,

              parent:
                recruitmentCategory.id,

              topic:
                `Podanie rekrutacyjne: ${interaction.user.tag}`,

              permissionOverwrites:
                permissions
            });

          const embed =
            new EmbedBuilder()

              .setColor(0x2ecc71)

              .setTitle(
                "📨 NOWE PODANIE REKRUTACYJNE"
              )

              .setDescription(

                `### 👤 Kandydat\n${interaction.user}\n\n` +

                `### 🎂 Wiek\n${age}\n\n` +

                `### 🛠️ Doświadczenie\n${experience}\n\n` +

                `### 🎯 Dlaczego chcesz dołączyć do administracji?\n${why}\n\n` +

                `### 💎 Dlaczego Ravexmc.pl?\n${whyServer}\n\n` +

                `### 📝 Coś o sobie\n${about}`
              )

              .setFooter({
                text:
                  "Ravexmc.pl • Podanie rekrutacyjne"
              })

              .setTimestamp();

          const buttons =
            new ActionRowBuilder()
              .addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    "application_accept"
                  )
                  .setLabel(
                    "Przyjmij"
                  )
                  .setEmoji("✅")
                  .setStyle(
                    ButtonStyle.Success
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "application_reject"
                  )
                  .setLabel(
                    "Odrzuć"
                  )
                  .setEmoji("❌")
                  .setStyle(
                    ButtonStyle.Danger
                  )
              );

          await channel.send({

            content:
              `${getTicketStaffRoles()
                .map(id => `<@&${id}>`)
                .join(" ")}\n📨 Nowe podanie!`,

            embeds: [embed],

            components: [buttons]
          });

          await sendLog(
            guild,
            "📨 Nowe podanie",

            `Kandydat: ${interaction.user}\n` +
            `Kanał: ${channel}`
          );

          return interaction.reply({

            content:
              `✅ Twoje podanie zostało wysłane!\n📨 ${channel}`,

            ephemeral: true
          });
        }
      }

      // =================================================
      // APPLICATION BUTTONS
      // =================================================

      if (
        interaction.isButton()
      ) {

        if (
          interaction.customId ===
          "application_accept"
        ) {

          if (
            !memberCanManageTicket(
              interaction.member
            )
          ) {

            return interaction.reply({
              content:
                "❌ Tylko administracja może rozpatrywać podania.",
              ephemeral: true
            });
          }

          await interaction.reply({

            content:
              `✅ Podanie zostało **zaakceptowane** przez ${interaction.user}.\n\n` +
              `Administracja może teraz skontaktować się z kandydatem.`
          });

          return;
        }

        if (
          interaction.customId ===
          "application_reject"
        ) {

          if (
            !memberCanManageTicket(
              interaction.member
            )
          ) {

            return interaction.reply({
              content:
                "❌ Tylko administracja może rozpatrywać podania.",
              ephemeral: true
            });
          }

          await interaction.reply({

            content:
              `❌ Podanie zostało **odrzucone** przez ${interaction.user}.`
          });

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
              "❌ Wystąpił błąd podczas wykonywania tej operacji.",

            ephemeral: true
          });

        } else {

          await interaction.reply({

            content:
              "❌ Wystąpił błąd podczas wykonywania tej operacji.",

            ephemeral: true
          });
        }

      } catch {}
    }
  }
);

// =====================================================
// LOGIN
// =====================================================

if (
  !process.env.DISCORD_TOKEN
) {

  console.error(
    "❌ Brak DISCORD_TOKEN w zmiennych środowiskowych Render."
  );

} else {

  client.login(
    process.env.DISCORD_TOKEN
  )

    .then(() => {

      console.log(
        "✅ Próba logowania bota została rozpoczęta."
      );

    })

    .catch(error => {

      console.error(
        "❌ Nie udało się zalogować bota:",
        error
      );
    });
}
