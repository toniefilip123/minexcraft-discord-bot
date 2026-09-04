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

// ======================================================
// RENDER
// ======================================================

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("Bot Discord działa!");
}).listen(PORT, "0.0.0.0", () => {
  console.log("Serwer HTTP działa na porcie " + PORT);
});

// ======================================================
// CLIENT
// ======================================================

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

// ======================================================
// PLIKI DANYCH
// ======================================================

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

const ECONOMY_FILE = path.join(
  DATA_DIR,
  "economy.json"
);

const XP_FILE = path.join(
  DATA_DIR,
  "xp.json"
);

const BACKUP_FILE = path.join(
  DATA_DIR,
  "backup.json"
);

// ======================================================
// MAPY
// ======================================================

const spamCounter = new Map();
const verificationQuestions = new Map();
const ticTacToeGames = new Map();

const xpCooldown = new Map();

// ======================================================
// JSON
// ======================================================

function loadJSON(file, defaultValue) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        JSON.stringify(defaultValue, null, 2)
      );

      return defaultValue;
    }

    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch {
    return defaultValue;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2)
  );
}

let economy = loadJSON(
  ECONOMY_FILE,
  {}
);

let xpData = loadJSON(
  XP_FILE,
  {}
);

// ======================================================
// FUNKCJE
// ======================================================

function isConfigured(value) {
  return (
    value &&
    !String(value).startsWith("WSTAW_")
  );
}

function isOwner(interaction) {
  if (!interaction.guild) {
    return false;
  }

  return (
    interaction.user.id === config.OWNER_ID &&
    interaction.guild.ownerId === interaction.user.id
  );
}

function getLogChannel(guild) {
  if (!guild) return null;

  return guild.channels.cache.get(
    config.LOG_CHANNEL_ID
  );
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
      "Błąd logów:",
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

  return getTicketStaffRoles().some(
    roleId => member.roles.cache.has(roleId)
  );
}

// ======================================================
// XP
// ======================================================

function getXPUser(userId) {
  if (!xpData[userId]) {
    xpData[userId] = {
      xp: 0,
      level: 1
    };
  }

  return xpData[userId];
}

function xpNeeded(level) {
  return level * 100;
}

async function addXP(message) {
  if (!message.guild) return;
  if (message.author.bot) return;

  const userId = message.author.id;

  if (xpCooldown.has(userId)) return;

  xpCooldown.set(userId, true);

  setTimeout(() => {
    xpCooldown.delete(userId);
  }, 60000);

  const user = getXPUser(userId);

  const amount =
    Math.floor(Math.random() * 11) + 10;

  user.xp += amount;

  let levelUp = false;

  while (
    user.xp >= xpNeeded(user.level)
  ) {
    user.xp -= xpNeeded(user.level);
    user.level++;
    levelUp = true;
  }

  saveJSON(XP_FILE, xpData);

  if (levelUp) {
    await message.channel.send(
      `🎉 ${message.author} awansował na **poziom ${user.level}**!`
    );
  }
}

// ======================================================
// EKONOMIA
// ======================================================

function getMoney(userId) {
  if (!economy[userId]) {
    economy[userId] = {
      money: 0,
      daily: 0
    };
  }

  return economy[userId];
}

function saveEconomy() {
  saveJSON(
    ECONOMY_FILE,
    economy
  );
}

// ======================================================
// TICKETY
// ======================================================

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
      "YouTube, TikTok, Twitch i inne",
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

// ======================================================
// KÓŁKO I KRZYŻYK
// ======================================================

function getWinner(board) {
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

function createGameButtons(
  gameId,
  board,
  disabled = false
) {
  const rows = [];

  for (let r = 0; r < 3; r++) {
    const row =
      new ActionRowBuilder();

    for (let c = 0; c < 3; c++) {
      const index = r * 3 + c;

      const value = board[index];

      const button =
        new ButtonBuilder()
          .setCustomId(
            `ttt_${gameId}_${index}`
          )
          .setLabel(
            value === "X"
              ? "❌"
              : value === "O"
                ? "⭕"
                : " "
          )
          .setDisabled(
            disabled || Boolean(value)
          );

      if (value === "X") {
        button.setStyle(
          ButtonStyle.Danger
        );
      } else if (value === "O") {
        button.setStyle(
          ButtonStyle.Primary
        );
      } else {
        button.setStyle(
          ButtonStyle.Secondary
        );
      }

      row.addComponents(button);
    }

    rows.push(row);
  }

  return rows;
}

async function deleteGame(gameId) {
  const game =
    ticTacToeGames.get(gameId);

  if (!game) return;

  ticTacToeGames.delete(gameId);

  try {
    const channel =
      await client.channels.fetch(
        game.channelId
      );

    const message =
      await channel.messages.fetch(
        game.messageId
      );

    await message.delete();
  } catch {}
}

// ======================================================
// BACKUP
// ======================================================

async function createBackup(guild) {
  const backup = {
    guildId: guild.id,
    guildName: guild.name,
    createdAt:
      new Date().toISOString(),

    roles: [],
    channels: []
  };

  // ROLE
  const roles =
    [...guild.roles.cache.values()]
      .filter(role =>
        role.id !== guild.id
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  for (const role of roles) {
    backup.roles.push({
      name: role.name,
      color: role.hexColor,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions:
        role.permissions.bitfield.toString(),
      position: role.position
    });
  }

  // KANAŁY
  const channels =
    [...guild.channels.cache.values()]
      .sort(
        (a, b) =>
          a.rawPosition - b.rawPosition
      );

  for (const channel of channels) {
    backup.channels.push({
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId || null,
      position: channel.rawPosition,
      topic: channel.topic || null,
      nsfw: channel.nsfw || false,
      rateLimitPerUser:
        channel.rateLimitPerUser || 0
    });
  }

  fs.writeFileSync(
    BACKUP_FILE,
    JSON.stringify(
      backup,
      null,
      2
    )
  );

  return backup;
}

// ======================================================
// RESTORE BACKUP
// ======================================================

async function restoreBackup(guild) {
  if (!fs.existsSync(BACKUP_FILE)) {
    throw new Error(
      "Nie znaleziono backupu."
    );
  }

  const backup =
    JSON.parse(
      fs.readFileSync(
        BACKUP_FILE,
        "utf8"
      )
    );

  // TWORZENIE RÓL
  for (const role of backup.roles) {
    const exists =
      guild.roles.cache.find(
        r => r.name === role.name
      );

    if (exists) continue;

    try {
      await guild.roles.create({
        name: role.name,
        color:
          role.color === "#000000"
            ? undefined
            : role.color,
        hoist: role.hoist,
        mentionable:
          role.mentionable,
        permissions:
          BigInt(role.permissions)
      });
    } catch {}
  }

  // KATEGORIE
  const categoryMap = {};

  for (const channel of backup.channels) {
    if (
      channel.type !==
      ChannelType.GuildCategory
    ) {
      continue;
    }

    const exists =
      guild.channels.cache.find(
        c =>
          c.name === channel.name &&
          c.type ===
            ChannelType.GuildCategory
      );

    if (exists) {
      categoryMap[channel.name] =
        exists.id;

      continue;
    }

    try {
      const created =
        await guild.channels.create({
          name: channel.name,
          type:
            ChannelType.GuildCategory
        });

      categoryMap[channel.name] =
        created.id;
    } catch {}
  }

  // POZOSTAŁE KANAŁY
  for (const channel of backup.channels) {
    if (
      channel.type ===
      ChannelType.GuildCategory
    ) {
      continue;
    }

    const exists =
      guild.channels.cache.find(
        c =>
          c.name === channel.name
      );

    if (exists) continue;

    let parent = null;

    if (channel.parentId) {
      const oldParent =
        backup.channels.find(
          c =>
            c.type ===
              ChannelType.GuildCategory &&
            c.name ===
              backup.channels.find(
                x =>
                  x.type ===
                    ChannelType.GuildCategory &&
                  x.id ===
                    channel.parentId
              )?.name
        );

      if (oldParent) {
        parent =
          categoryMap[
            oldParent.name
          ] || null;
      }
    }

    try {
      await guild.channels.create({
        name: channel.name,
        type: channel.type,
        parent,
        topic: channel.topic || undefined,
        nsfw: channel.nsfw,
        rateLimitPerUser:
          channel.rateLimitPerUser
      });
    } catch {}
  }

  return backup;
}

// ======================================================
// KOMENDY
// ======================================================

const commands = [

  new SlashCommandBuilder()
    .setName("weryfikacja")
    .setDescription(
      "Wyślij panel weryfikacji"
    ),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription(
      "Wyślij panel ticketów"
    ),

  new SlashCommandBuilder()
    .setName("kolkoikrzyzyk")
    .setDescription(
      "Wyzwij gracza do gry w kółko i krzyżyk"
    )
    .addUserOption(option =>
      option
        .setName("wyzwij")
        .setDescription(
          "Wybierz przeciwnika"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("profil")
    .setDescription(
      "Wyświetl swój profil"
    )
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription(
          "Opcjonalnie wybierz użytkownika"
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("bal")
    .setDescription(
      "Sprawdź swoje saldo"
    ),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription(
      "Odbierz codzienną nagrodę"
    ),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription(
      "Przelej pieniądze"
    )
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription(
          "Odbiorca"
        )
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("kwota")
        .setDescription(
          "Kwota"
        )
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("moneta")
    .setDescription(
      "Rzut monetą"
    ),

  new SlashCommandBuilder()
    .setName("kostka")
    .setDescription(
      "Rzut kostką"
    ),

  new SlashCommandBuilder()
    .setName("kamienpapiernozyce")
    .setDescription(
      "Zagraj w kamień papier nożyce"
    )
    .addStringOption(option =>
      option
        .setName("wybor")
        .setDescription(
          "Twój wybór"
        )
        .setRequired(true)
        .addChoices(
          {
            name: "🪨 Kamień",
            value: "kamien"
          },
          {
            name: "📄 Papier",
            value: "papier"
          },
          {
            name: "✂️ Nożyce",
            value: "nozyce"
          }
        )
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
          "Ilość wiadomości"
        )
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
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
          "Powód"
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
      "Wyślij wiadomość jako bot"
    )
    .addStringOption(option =>
      option
        .setName("tekst")
        .setDescription(
          "Treść"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription(
      "Informacje o serwerze"
    ),

  new SlashCommandBuilder()
    .setName("backup")
    .setDescription(
      "Przywróć ostatni backup"
    ),

  new SlashCommandBuilder()
    .setName("zapisz")
    .setDescription(
      "Zapisz backup serwera"
    ),

  new SlashCommandBuilder()
    .setName("usun-kanaly")
    .setDescription(
      "Usuń wszystkie kanały"
    ),

  new SlashCommandBuilder()
    .setName("rekrutacja")
    .setDescription(
      "Wyślij panel rekrutacyjny"
    )
];

// ======================================================
// READY
// ======================================================

client.once(
  Events.ClientReady,
  async () => {

    console.log(
      `Zalogowano jako ${client.user.tag}`
    );

    try {
      const guild =
        await client.guilds.fetch(
          config.GUILD_ID
        );

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
        "Błąd rejestracji:",
        error
      );
    }
  }
);

// ======================================================
// MEMBER ADD
// ======================================================

client.on(
  Events.GuildMemberAdd,
  async member => {

    // ANTY BOT
    if (member.user.bot) {

      setTimeout(
        async () => {

          try {

            const logs =
              await member.guild.fetchAuditLogs({
                type:
                  AuditLogEvent.BotAdd,
                limit: 10
              });

            const entry =
              logs.entries.find(
                log =>
                  log.target?.id ===
                  member.id
              );

            const executor =
              entry?.executor;

            if (!executor) return;

            if (
              executor.id ===
                config.OWNER_ID &&
              executor.id ===
                member.guild.ownerId
            ) {

              await sendLog(
                member.guild,
                "🤖 Bot dodany",
                `Bot **${member.user.tag}** został dodany przez właściciela.`
              );

              return;
            }

            await sendLog(
              member.guild,
              "🚨 ANTY-BOT",
              `Wykryto próbę dodania obcego bota.\n\n` +
              `Bot: **${member.user.tag}**\n` +
              `Dodał: <@${executor.id}>`
            );

            await member.kick(
              "Anti-Bot: bot dodany przez osobę inną niż właściciel"
            ).catch(() => {});

          } catch (error) {
            console.log(
              "Anti-Bot:",
              error.message
            );
          }

        },
        1500
      );

      return;
    }

    // POWITANIE
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
          "👋 Witamy na serwerze!"
        )
        .setDescription(
          `Witaj ${member}!\n\n` +
          `Miło Cię widzieć na **${member.guild.name}**.\n` +
          `Przejdź weryfikację, aby uzyskać dostęp do serwera.`
        )
        .setThumbnail(
          member.user.displayAvatarURL()
        )
        .setTimestamp();

    await channel.send({
      embeds: [embed]
    }).catch(() => {});
  }
);

// ======================================================
// SPAM + XP
// ======================================================

client.on(
  Events.MessageCreate,
  async message => {

    if (!message.guild) return;
    if (message.author.bot) return;

    await addXP(message);

    const content =
      message.content
        .trim()
        .toLowerCase();

    if (!content) return;

    const key =
      `${message.author.id}:${content}`;

    const count =
      (spamCounter.get(key) || 0) + 1;

    spamCounter.set(
      key,
      count
    );

    setTimeout(
      () =>
        spamCounter.delete(key),
      15000
    );

    if (count >= 5) {

      spamCounter.delete(key);

      try {

        await message.member.timeout(
          60000,
          "Automatyczny anty-spam"
        );

        await message.channel.send(
          `⚠️ ${message.author}, zostałeś wyciszony za spam.`
        );

      } catch {}
    }
  }
);

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
  Events.InteractionCreate,
  async interaction => {

    try {

      // ==================================================
      // SLASH COMMANDS
      // ==================================================

      if (
        interaction.isChatInputCommand()
      ) {

        // ==================================================
        // KÓŁKO I KRZYŻYK
        // ==================================================

        if (
          interaction.commandName ===
          "kolkoikrzyzyk"
        ) {

          const opponent =
            interaction.options.getUser(
              "wyzwij"
            );

          if (
            opponent.bot
          ) {
            return interaction.reply({
              content:
                "❌ Nie możesz wyzwać bota.",
              ephemeral: true
            });
          }

          if (
            opponent.id ===
            interaction.user.id
          ) {
            return interaction.reply({
              content:
                "❌ Nie możesz grać sam ze sobą.",
              ephemeral: true
            });
          }

          const gameId =
            `${Date.now()}_${interaction.user.id}`;

          const game = {
            playerX:
              interaction.user.id,

            playerO:
              opponent.id,

            board:
              Array(9).fill(null),

            turn:
              interaction.user.id,

            channelId:
              interaction.channel.id,

            messageId:
              null
          };

          const embed =
            new EmbedBuilder()
              .setColor(
                config.EMBED_COLOR
              )
              .setTitle(
                "⭕ Kółko i krzyżyk ❌"
              )
              .setDescription(
                `❌ <@${game.playerX}>\n` +
                `⭕ <@${game.playerO}>\n\n` +
                `🎮 Teraz ruch ma <@${game.turn}>\n\n` +
                `⏱️ Gra zostanie automatycznie usunięta po **10 minutach**.`
              );

          await interaction.reply({
            embeds: [embed],
            components:
              createGameButtons(
                gameId,
                game.board
              )
          });

          const message =
            await interaction.fetchReply();

          game.messageId =
            message.id;

          ticTacToeGames.set(
            gameId,
            game
          );

          setTimeout(
            () =>
              deleteGame(gameId),
            10 * 60 * 1000
          );

          return;
        }

        // ==================================================
        // TICKETY
        // ==================================================

        if (
          interaction.commandName ===
          "ticket"
        ) {

          const embed =
            new EmbedBuilder()
              .setColor(
                config.EMBED_COLOR
              )
              .setTitle(
                "🎫 CENTRUM POMOCY"
              )
              .setDescription(
                `Potrzebujesz pomocy administracji?\n\n` +
                `Kliknij poniższe menu i wybierz odpowiednią kategorię.\n\n` +
                `📌 **Wybierz kategorię pomocy**`
              )
              .setFooter({
                text:
                  "Centrum Pomocy • Administracja"
              })
              .setTimestamp();

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                "ticket_category_select"
              )
              .setPlaceholder(
                "📂 Wybierz kategorię pomocy"
              )
              .addOptions(
                Object.entries(
                  ticketCategories
                ).map(
                  ([value, data]) => ({
                    label:
                      data.label,

                    description:
                      data.description,

                    value,

                    emoji:
                      data.emoji
                  })
                )
              );

          const row =
            new ActionRowBuilder()
              .addComponents(menu);

          await interaction.reply({
            embeds: [embed],
            components: [row]
          });

          return;
        }

        // ==================================================
        // PROFIL
        // ==================================================

        if (
          interaction.commandName ===
          "profil"
        ) {

          const user =
            interaction.options.getUser(
              "uzytkownik"
            ) ||
            interaction.user;

          const data =
            getXPUser(user.id);

          const money =
            getMoney(user.id);

          const embed =
            new EmbedBuilder()
              .setColor(
                config.EMBED_COLOR
              )
              .setTitle(
                `👤 Profil ${user.username}`
              )
              .setThumbnail(
                user.displayAvatarURL()
              )
              .addFields(
                {
                  name: "📊 Poziom",
                  value:
                    `${data.level}`,
                  inline: true
                },
                {
                  name: "⭐ XP",
                  value:
                    `${data.xp}/${xpNeeded(data.level)}`,
                  inline: true
                },
                {
                  name: "💰 Saldo",
                  value:
                    `${money.money} monet`,
                  inline: true
                }
              );

          await interaction.reply({
            embeds: [embed]
          });

          return;
        }

        // ==================================================
        // BAL
        // ==================================================

        if (
          interaction.commandName ===
          "bal"
        ) {

          const data =
            getMoney(
              interaction.user.id
            );

          await interaction.reply(
            `💰 Masz **${data.money} monet**.`
          );

          return;
        }

        // ==================================================
        // DAILY
        // ==================================================

        if (
          interaction.commandName ===
          "daily"
        ) {

          const data =
            getMoney(
              interaction.user.id
            );

          const now =
            Date.now();

          if (
            data.daily &&
            now - data.daily <
              24 * 60 * 60 * 1000
          ) {

            const remaining =
              24 * 60 * 60 * 1000 -
              (now - data.daily);

            const hours =
              Math.ceil(
                remaining /
                  1000 /
                  60 /
                  60
              );

            return interaction.reply({
              content:
                `⏳ Daily możesz odebrać za około **${hours}h**.`,
              ephemeral: true
            });
          }

          data.money += 500;
          data.daily = now;

          saveEconomy();

          await interaction.reply(
            "🎁 Otrzymujesz **500 monet** za daily!"
          );

          return;
        }

        // ==================================================
        // PAY
        // ==================================================

        if (
          interaction.commandName ===
          "pay"
        ) {

          const target =
            interaction.options.getUser(
              "uzytkownik"
            );

          const amount =
            interaction.options.getInteger(
              "kwota"
            );

          if (
            target.bot ||
            target.id ===
              interaction.user.id
          ) {
            return interaction.reply({
              content:
                "❌ Nie możesz przelać pieniędzy tej osobie.",
              ephemeral: true
            });
          }

          const sender =
            getMoney(
              interaction.user.id
            );

          if (
            sender.money < amount
          ) {
            return interaction.reply({
              content:
                "❌ Nie masz wystarczającej ilości monet.",
              ephemeral: true
            });
          }

          const receiver =
            getMoney(
              target.id
            );

          sender.money -= amount;
          receiver.money += amount;

          saveEconomy();

          await interaction.reply(
            `💸 Przelano **${amount} monet** użytkownikowi ${target}.`
          );

          return;
        }

        // ==================================================
        // MONETA
        // ==================================================

        if (
          interaction.commandName ===
          "moneta"
        ) {

          const result =
            Math.random() < 0.5
              ? "🪙 ORZEŁ"
              : "🪙 RESZKA";

          await interaction.reply(
            `🎲 Wypadło: **${result}**`
          );

          return;
        }

        // ==================================================
        // KOSTKA
        // ==================================================

        if (
          interaction.commandName ===
          "kostka"
        ) {

          const result =
            Math.floor(
              Math.random() * 6
            ) + 1;

          await interaction.reply(
            `🎲 Wyrzuciłeś **${result}**!`
          );

          return;
        }

        // ==================================================
        // KAMIEN PAPIER NOZYCE
        // ==================================================

        if (
          interaction.commandName ===
          "kamienpapiernozyce"
        ) {

          const player =
            interaction.options.getString(
              "wybor"
            );

          const choices = [
            "kamien",
            "papier",
            "nozyce"
          ];

          const bot =
            choices[
              Math.floor(
                Math.random() *
                  choices.length
              )
            ];

          const names = {
            kamien: "🪨 Kamień",
            papier: "📄 Papier",
            nozyce: "✂️ Nożyce"
          };

          let result;

          if (player === bot) {
            result = "🤝 Remis!";
          } else if (
            (
              player === "kamien" &&
              bot === "nozyce"
            ) ||
            (
              player === "papier" &&
              bot === "kamien"
            ) ||
            (
              player === "nozyce" &&
              bot === "papier"
            )
          ) {
            result = "🏆 Wygrywasz!";
          } else {
            result = "❌ Przegrywasz!";
          }

          await interaction.reply(
            `Ty: **${names[player]}**\n` +
            `Bot: **${names[bot]}**\n\n` +
            `**${result}**`
          );

          return;
        }

        // ==================================================
        // CLEAR
        // ==================================================

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
                "❌ Nie masz uprawnień.",
              ephemeral: true
            });
          }

          const amount =
            interaction.options.getInteger(
              "ilosc"
            );

          const deleted =
            await interaction.channel.bulkDelete(
              amount,
              true
            );

          await interaction.reply({
            content:
              `🗑️ Usunięto **${deleted.size}** wiadomości.`,
            ephemeral: true
          });

          return;
        }

        // ==================================================
        // BAN
        // ==================================================

        if (
          interaction.commandName ===
          "ban"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ Tylko właściciel może używać tej komendy.",
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
            "Brak powodu";

          const member =
            await interaction.guild.members.fetch(
              user.id
            ).catch(() => null);

          if (!member) {
            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika.",
              ephemeral: true
            });
          }

          await member.ban({
            reason
          });

          await interaction.reply(
            `🔨 Zbanowano **${user.tag}**.\nPowód: **${reason}**`
          );

          return;
        }

        // ==================================================
        // KICK
        // ==================================================

        if (
          interaction.commandName ===
          "kick"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ Tylko właściciel może używać tej komendy.",
              ephemeral: true
            });
          }

          const user =
            interaction.options.getUser(
              "uzytkownik"
            );

          const member =
            await interaction.guild.members.fetch(
              user.id
            ).catch(() => null);

          if (!member) {
            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika.",
              ephemeral: true
            });
          }

          await member.kick(
            "Kick przez właściciela"
          );

          await interaction.reply(
            `👢 Wyrzucono **${user.tag}**.`
          );

          return;
        }

        // ==================================================
        // MUTE
        // ==================================================

        if (
          interaction.commandName ===
          "mute"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ Tylko właściciel może używać tej komendy.",
              ephemeral: true
            });
          }

          const user =
            interaction.options.getUser(
              "uzytkownik"
            );

          const member =
            await interaction.guild.members.fetch(
              user.id
            ).catch(() => null);

          if (!member) {
            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika.",
              ephemeral: true
            });
          }

          await member.timeout(
            10 * 60 * 1000,
            "Mute 10 minut"
          );

          await interaction.reply(
            `🔇 Wyciszono **${user.tag}** na 10 minut.`
          );

          return;
        }

        // ==================================================
        // UNMUTE
        // ==================================================

        if (
          interaction.commandName ===
          "unmute"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ Tylko właściciel może używać tej komendy.",
              ephemeral: true
            });
          }

          const user =
            interaction.options.getUser(
              "uzytkownik"
            );

          const member =
            await interaction.guild.members.fetch(
              user.id
            ).catch(() => null);

          if (!member) {
            return interaction.reply({
              content:
                "❌ Nie znaleziono użytkownika.",
              ephemeral: true
            });
          }

          await member.timeout(null);

          await interaction.reply(
            `🔊 Zdjęto wyciszenie z **${user.tag}**.`
          );

          return;
        }

        // ==================================================
        // SAY
        // ==================================================

        if (
          interaction.commandName ===
          "say"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ Tylko właściciel może używać tej komendy.",
              ephemeral: true
            });
          }

          const text =
            interaction.options.getString(
              "tekst"
            );

          await interaction.reply({
            content:
              "✅ Wysłano.",
            ephemeral: true
          });

          await interaction.channel.send(
            text
          );

          return;
        }

        // ==================================================
        // SERVERINFO
        // ==================================================

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
              .addFields(
                {
                  name:
                    "👑 Właściciel",
                  value:
                    `<@${guild.ownerId}>`,
                  inline: true
                },
                {
                  name:
                    "👥 Członkowie",
                  value:
                    `${guild.memberCount}`,
                  inline: true
                },
                {
                  name:
                    "💬 Kanały",
                  value:
                    `${guild.channels.cache.size}`,
                  inline: true
                },
                {
                  name:
                    "🏷️ Role",
                  value:
                    `${guild.roles.cache.size}`,
                  inline: true
                }
              )
              .setThumbnail(
                guild.iconURL()
              )
              .setTimestamp();

          await interaction.reply({
            embeds: [embed]
          });

          return;
        }

        // ==================================================
        // ZAPISZ
        // ==================================================

        if (
          interaction.commandName ===
          "zapisz"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "🚫 Tylko właściciel może tworzyć backup.",
              ephemeral: true
            });
          }

          await interaction.deferReply({
            ephemeral: true
          });

          const backup =
            await createBackup(
              interaction.guild
            );

          await interaction.editReply(
            `💾 **Backup zapisany!**\n\n` +
            `📁 Kategorie i kanały: **${backup.channels.length}**\n` +
            `🏷️ Role: **${backup.roles.length}**\n\n` +
            `📅 ${new Date().toLocaleString("pl-PL")}`
          );

          await sendLog(
            interaction.guild,
            "💾 Utworzono backup",
            `Backup został utworzony przez ${interaction.user}.`
          );

          return;
        }

        // ==================================================
        // BACKUP / RESTORE
        // ==================================================

        if (
          interaction.commandName ===
          "backup"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "🚫 Tylko właściciel może przywrócić backup.",
              ephemeral: true
            });
          }

          if (
            !fs.existsSync(
              BACKUP_FILE
            )
          ) {
            return interaction.reply({
              content:
                "❌ Nie ma jeszcze zapisanego backupu. Najpierw użyj `/zapisz`.",
              ephemeral: true
            });
          }

          const row =
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "restore_backup"
                  )
                  .setLabel(
                    "Przywróć backup"
                  )
                  .setEmoji("♻️")
                  .setStyle(
                    ButtonStyle.Success
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "cancel_restore"
                  )
                  .setLabel(
                    "Anuluj"
                  )
                  .setStyle(
                    ButtonStyle.Secondary
                  )
              );

          await interaction.reply({
            content:
              "♻️ **Przywracanie backupu**\n\n" +
              "Bot spróbuje odtworzyć zapisane role, kategorie i kanały.\n\n" +
              "⚠️ Istniejące elementy nie zostaną usunięte.",
            components: [row],
            ephemeral: true
          });

          return;
        }

        // ==================================================
        // USUŃ KANAŁY
        // ==================================================

        if (
          interaction.commandName ===
          "usun-kanaly"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "🚫 Tylko właściciel może używać tej komendy.",
              ephemeral: true
            });
          }

          const row =
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "confirm_delete_channels"
                  )
                  .setLabel(
                    "USUŃ WSZYSTKIE KANAŁY"
                  )
                  .setEmoji("🗑️")
                  .setStyle(
                    ButtonStyle.Danger
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "cancel_delete_channels"
                  )
                  .setLabel(
                    "Anuluj"
                  )
                  .setStyle(
                    ButtonStyle.Secondary
                  )
              );

          await interaction.reply({
            content:
              "🚨 **UWAGA!**\n\n" +
              "Ta operacja usunie wszystkie kanały serwera.\n\n" +
              "Przed usunięciem zostanie wykonany backup.",
            components: [row],
            ephemeral: true
          });

          return;
        }

        // ==================================================
        // REKRUTACJA
        // ==================================================

        if (
          interaction.commandName ===
          "rekrutacja"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ Tylko właściciel może wysłać panel rekrutacji.",
              ephemeral: true
            });
          }

          const embed =
            new EmbedBuilder()
              .setColor(
                config.EMBED_COLOR
              )
              .setTitle(
                "📋 REKRUTACJA DO ADMINISTRACJI"
              )
              .setDescription(
                `Chcesz dołączyć do naszej administracji?\n\n` +
                `Kliknij przycisk poniżej i wypełnij formularz rekrutacyjny.\n\n` +
                `⭐ **Wymagania:**\n` +
                `• kultura osobista\n` +
                `• znajomość regulaminu\n` +
                `• aktywność\n` +
                `• odpowiedzialność\n` +
                `• chęć pomocy innym`
              )
              .setFooter({
                text:
                  "Rekrutacja • Administracja"
              });

          const row =
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "recruitment_button"
                  )
                  .setLabel(
                    "Złóż podanie"
                  )
                  .setEmoji("📝")
                  .setStyle(
                    ButtonStyle.Success
                  )
              );

          await interaction.reply({
            embeds: [embed],
            components: [row]
          });

          return;
        }
      }

      // ==================================================
      // SELECT MENU
      // ==================================================

      if (
        interaction.isStringSelectMenu()
      ) {

        if (
          interaction.customId ===
          "ticket_category_select"
        ) {

          const type =
            interaction.values[0];

          const category =
            ticketCategories[type];

          const modal =
            new ModalBuilder()
              .setCustomId(
                `ticket_modal_${type}`
              )
              .setTitle(
                category.label
              );

          const nick =
            new TextInputBuilder()
              .setCustomId(
                "ticket_nick"
              )
              .setLabel(
                "Nick Minecraft"
              )
              .setPlaceholder(
                "Wpisz swój nick Minecraft"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMaxLength(16);

          const problem =
            new TextInputBuilder()
              .setCustomId(
                "ticket_problem"
              )
              .setLabel(
                "Opisz swoją sprawę"
              )
              .setPlaceholder(
                "Dokładnie opisz problem..."
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setRequired(true)
              .setMaxLength(1000);

          const screen =
            new TextInputBuilder()
              .setCustomId(
                "ticket_screen"
              )
              .setLabel(
                "Screen / dodatkowe informacje"
              )
              .setPlaceholder(
                "Opcjonalnie"
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setRequired(false)
              .setMaxLength(500);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(nick),

            new ActionRowBuilder()
              .addComponents(problem),

            new ActionRowBuilder()
              .addComponents(screen)
          );

          await interaction.showModal(
            modal
          );

          return;
        }
      }

      // ==================================================
      // BUTTONS
      // ==================================================

      if (
        interaction.isButton()
      ) {

        // ==================================================
        // KÓŁKO I KRZYŻYK
        // ==================================================

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

          if (!game) {
            return interaction.reply({
              content:
                "❌ Ta gra już wygasła.",
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
                "❌ Nie jesteś graczem tej gry.",
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

          const mark =
            interaction.user.id ===
              game.playerX
              ? "X"
              : "O";

          game.board[position] =
            mark;

          const winner =
            getWinner(
              game.board
            );

          if (winner) {

            const winnerId =
              winner === "X"
                ? game.playerX
                : game.playerO;

            const embed =
              new EmbedBuilder()
                .setColor(
                  config.EMBED_COLOR
                )
                .setTitle(
                  "🏆 KONIEC GRY!"
                )
                .setDescription(
                  `🎉 Wygrał <@${winnerId}>!\n\n` +
                  `❌ <@${game.playerX}>\n` +
                  `⭕ <@${game.playerO}>`
                );

            await interaction.update({
              embeds: [embed],
              components:
                createGameButtons(
                  gameId,
                  game.board,
                  true
                )
            });

            return;
          }

          if (
            game.board.every(
              field =>
                field !== null
            )
          ) {

            const embed =
              new EmbedBuilder()
                .setColor(
                  config.EMBED_COLOR
                )
                .setTitle(
                  "🤝 REMIS!"
                )
                .setDescription(
                  `Nikt nie wygrał.\n\n` +
                  `❌ <@${game.playerX}>\n` +
                  `⭕ <@${game.playerO}>`
                );

            await interaction.update({
              embeds: [embed],
              components:
                createGameButtons(
                  gameId,
                  game.board,
                  true
                )
            });

            return;
          }

          game.turn =
            game.turn ===
              game.playerX
              ? game.playerO
              : game.playerX;

          const embed =
            new EmbedBuilder()
              .setColor(
                config.EMBED_COLOR
              )
              .setTitle(
                "⭕ Kółko i krzyżyk ❌"
              )
              .setDescription(
                `❌ <@${game.playerX}>\n` +
                `⭕ <@${game.playerO}>\n\n` +
                `🎮 Teraz ruch ma <@${game.turn}>\n\n` +
                `⏱️ Gra zostanie usunięta po 10 minutach.`
              );

          await interaction.update({
            embeds: [embed],
            components:
              createGameButtons(
                gameId,
                game.board
              )
          });

          return;
        }

        // ==================================================
        // VERIFY
        // ==================================================

        if (
          interaction.customId ===
          "verify"
        ) {

          const a =
            Math.floor(
              Math.random() * 15
            ) + 1;

          const b =
            Math.floor(
              Math.random() * 15
            ) + 1;

          verificationQuestions.set(
            interaction.user.id,
            a + b
          );

          const modal =
            new ModalBuilder()
              .setCustomId(
                "verification_modal"
              )
              .setTitle(
                "🛡️ Weryfikacja"
              );

          const nick =
            new TextInputBuilder()
              .setCustomId(
                "minecraft_nick"
              )
              .setLabel(
                "Nick Minecraft"
              )
              .setPlaceholder(
                "Twój nick Minecraft"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMaxLength(16);

          const math =
            new TextInputBuilder()
              .setCustomId(
                "math_answer"
              )
              .setLabel(
                `Ile to ${a} + ${b}?`
              )
              .setPlaceholder(
                "Wpisz wynik"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(nick),

            new ActionRowBuilder()
              .addComponents(math)
          );

          await interaction.showModal(
            modal
          );

          return;
        }

        // ==================================================
        // DELETE CHANNELS
        // ==================================================

        if (
          interaction.customId ===
          "confirm_delete_channels"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "🚫 Brak dostępu.",
              ephemeral: true
            });
          }

          await interaction.update({
            content:
              "💾 Tworzę backup przed usunięciem kanałów...",
            embeds: [],
            components: []
          });

          await createBackup(
            interaction.guild
          );

          const channels =
            [
              ...interaction.guild.channels.cache.values()
            ];

          for (
            const channel of channels
          ) {

            try {

              await channel.delete(
                "Usunięcie wszystkich kanałów przez właściciela"
              );

            } catch (error) {

              console.log(
                `Nie usunięto ${channel.name}: ${error.message}`
              );
            }
          }

          return;
        }

        if (
          interaction.customId ===
          "cancel_delete_channels"
        ) {

          return interaction.update({
            content:
              "✅ Usuwanie kanałów anulowane.",
            components: []
          });
        }

        // ==================================================
        // RESTORE
        // ==================================================

        if (
          interaction.customId ===
          "restore_backup"
        ) {

          if (
            !isOwner(interaction)
          ) {
            return interaction.reply({
              content:
                "🚫 Brak dostępu.",
              ephemeral: true
            });
          }

          await interaction.update({
            content:
              "♻️ Przywracam backup...",
            components: []
          });

          try {

            const backup =
              await restoreBackup(
                interaction.guild
              );

            await interaction.editReply({
              content:
                `✅ Backup przywrócony!\n\n` +
                `📁 Kanały: **${backup.channels.length}**\n` +
                `🏷️ Role: **${backup.roles.length}**`
            });

          } catch (error) {

            console.log(
              "Restore:",
              error
            );

            await interaction.editReply({
              content:
                "❌ Nie udało się przywrócić backupu."
            });
          }

          return;
        }

        if (
          interaction.customId ===
          "cancel_restore"
        ) {

          return interaction.update({
            content:
              "✅ Przywracanie anulowane.",
            components: []
          });
        }

        // ==================================================
        // CLOSE TICKET
        // ==================================================

        if (
          interaction.customId ===
          "close_ticket"
        ) {

          const staff =
            memberCanManageTicket(
              interaction.member
            );

          const creator =
            interaction.channel.name ===
            `ticket-${interaction.user.id}`;

          if (
            !staff &&
            !creator
          ) {
            return interaction.reply({
              content:
                "❌ Nie możesz zamknąć tego ticketu.",
              ephemeral: true
            });
          }

          await interaction.reply(
            "🔒 Ticket zostanie usunięty za 3 sekundy."
          );

          setTimeout(
            () =>
              interaction.channel
                .delete()
                .catch(() => {}),
            3000
          );

          return;
        }

        // ==================================================
        // CLAIM TICKET
        // ==================================================

        if (
          interaction.customId ===
          "claim_ticket"
        ) {

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

          await interaction.reply(
            `👤 Ticket został przejęty przez ${interaction.user}.`
          );

          return;
        }

        // ==================================================
        // REKRUTACJA
        // ==================================================

        if (
          interaction.customId ===
          "recruitment_button"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "recruitment_modal"
              )
              .setTitle(
                "📋 Rekrutacja"
              );

          const age =
            new TextInputBuilder()
              .setCustomId(
                "recruitment_age"
              )
              .setLabel(
                "Wiek"
              )
              .setPlaceholder(
                "Podaj swój wiek"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true);

          const experience =
            new TextInputBuilder()
              .setCustomId(
                "recruitment_experience"
              )
              .setLabel(
                "Doświadczenie"
              )
              .setPlaceholder(
                "Opisz swoje doświadczenie"
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setRequired(true);

          const reason =
            new TextInputBuilder()
              .setCustomId(
                "recruitment_reason"
              )
              .setLabel(
                "Dlaczego chcesz zostać administratorem?"
              )
              .setPlaceholder(
                "Napisz kilka zdań"
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(age),

            new ActionRowBuilder()
              .addComponents(experience),

            new ActionRowBuilder()
              .addComponents(reason)
          );

          await interaction.showModal(
            modal
          );

          return;
        }
      }

      // ==================================================
      // MODALE
      // ==================================================

      if (
        interaction.isModalSubmit()
      ) {

        // ==================================================
        // WERYFIKACJA
        // ==================================================

        if (
          interaction.customId ===
          "verification_modal"
        ) {

          const nick =
            interaction.fields.getTextInputValue(
              "minecraft_nick"
            );

          const answer =
            interaction.fields.getTextInputValue(
              "math_answer"
            );

          const correct =
            verificationQuestions.get(
              interaction.user.id
            );

          if (
            Number(answer) !==
            Number(correct)
          ) {

            verificationQuestions.delete(
              interaction.user.id
            );

            return interaction.reply({
              content:
                "❌ Niepoprawna odpowiedź.",
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

          await interaction.member.roles.add(
            role
          );

          try {
            await interaction.member.setNickname(
              nick
            );
          } catch {}

          await interaction.reply({
            content:
              `✅ Weryfikacja zakończona pomyślnie!\n\n` +
              `🎮 Nick Minecraft: **${nick}**`,
            ephemeral: true
          });

          return;
        }

        // ==================================================
        // TICKET
        // ==================================================

        if (
          interaction.customId.startsWith(
            "ticket_modal_"
          )
        ) {

          const type =
            interaction.customId.replace(
              "ticket_modal_",
              ""
            );

          const category =
            ticketCategories[type];

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

          const existing =
            interaction.guild.channels.cache.find(
              channel =>
                channel.name ===
                `ticket-${interaction.user.id}`
            );

          if (existing) {
            return interaction.reply({
              content:
                `❌ Masz już otwarty ticket: ${existing}`,
              ephemeral: true
            });
          }

          const permissions = [
            {
              id:
                interaction.guild.id,

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
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            });
          }

          const channel =
            await interaction.guild.channels.create({
              name:
                `ticket-${interaction.user.id}`,

              type:
                ChannelType.GuildText,

              parent:
                config.TICKET_CATEGORY_ID,

              permissionOverwrites:
                permissions
            });

          const embed =
            new EmbedBuilder()
              .setColor(
                config.EMBED_COLOR
              )
              .setTitle(
                "🎫 NOWY TICKET"
              )
              .setDescription(
                `Witaj ${interaction.user}!\n\n` +

                `📂 **Kategoria**\n` +
                `${category.label}\n\n` +

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

          const buttons =
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "claim_ticket"
                  )
                  .setLabel(
                    "Przejmij ticket"
                  )
                  .setEmoji("👤")
                  .setStyle(
                    ButtonStyle.Primary
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "close_ticket"
                  )
                  .setLabel(
                    "Zamknij ticket"
                  )
                  .setEmoji("🔒")
                  .setStyle(
                    ButtonStyle.Danger
                  )
              );

          const staff =
            getTicketStaffRoles()
              .map(
                id => `<@&${id}>`
              )
              .join(" ");

          await channel.send({
            content:
              `${interaction.user} ${staff}`,
            embeds: [embed],
            components: [buttons]
          });

          await interaction.reply({
            content:
              `✅ Twój ticket został utworzony: ${channel}`,
            ephemeral: true
          });

          await sendLog(
            interaction.guild,
            "🎫 Nowy ticket",
            `Użytkownik: ${interaction.user}\n` +
            `Kategoria: **${category.label}**\n` +
            `Kanał: ${channel}`
          );

          return;
        }

        // ==================================================
        // REKRUTACJA
        // ==================================================

        if (
          interaction.customId ===
          "recruitment_modal"
        ) {

          const age =
            interaction.fields.getTextInputValue(
              "recruitment_age"
            );

          const experience =
            interaction.fields.getTextInputValue(
              "recruitment_experience"
            );

          const reason =
            interaction.fields.getTextInputValue(
              "recruitment_reason"
            );

          const channel =
            getLogChannel(
              interaction.guild
            );

          if (channel) {

            const embed =
              new EmbedBuilder()
                .setColor(
                  config.EMBED_COLOR
                )
                .setTitle(
                  "📋 NOWE PODANIE REKRUTACYJNE"
                )
                .addFields(
                  {
                    name:
                      "👤 Kandydat",
                    value:
                      `${interaction.user} (${interaction.user.tag})`
                  },
                  {
                    name:
                      "🎂 Wiek",
                    value: age
                  },
                  {
                    name:
                      "⭐ Doświadczenie",
                    value:
                      experience
                  },
                  {
                    name:
                      "💬 Dlaczego chcesz dołączyć?",
                    value:
                      reason
                  }
                )
                .setTimestamp();

            await channel.send({
              embeds: [embed]
            });
          }

          await interaction.reply({
            content:
              "✅ Twoje podanie zostało wysłane do administracji.",
            ephemeral: true
          });

          return;
        }
      }

    } catch (error) {

      console.error(
        "Interaction error:",
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

// ======================================================
// LOGIN
// ======================================================

if (
  !process.env.DISCORD_TOKEN
) {

  console.error(
    "❌ Brak DISCORD_TOKEN na Renderze!"
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
