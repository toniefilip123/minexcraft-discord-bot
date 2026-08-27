const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot Discord działa!");
}).listen(PORT, "0.0.0.0", () => {
  console.log("Serwer HTTP działa na porcie " + PORT);
});

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require("discord.js");

const config = require("./config");

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

/* ========================================
   USTAWIENIA
======================================== */

const ticketTypes = {
  pomoc: {
    name: "Pomoc z wejściem na serwer",
    emoji: "🚪"
  },
  gracz: {
    name: "Zgłoszenie gracza",
    emoji: "🚨"
  },
  media: {
    name: "Media & Twórca",
    emoji: "🎥"
  },
  wspolpraca: {
    name: "Współpraca",
    emoji: "🤝"
  }
};

const ticketStaffRoles = [
  config.CEO_ROLE_ID,
  config.ADMIN_ROLE_ID,
  config.MODERATOR_ROLE_ID,
  config.POMOCNIK_ROLE_ID,
  config.HADMIN_ROLE_ID
].filter(Boolean);

const spamCounter = new Map();
const ticketOwners = new Map();

/* ========================================
   FUNKCJE
======================================== */

function isConfigured(value) {
  return value && !String(value).startsWith("WSTAW_");
}

function getLogChannel(guild) {
  if (!isConfigured(config.LOG_CHANNEL_ID)) {
    return null;
  }

  return guild.channels.cache.get(config.LOG_CHANNEL_ID) || null;
}

async function sendLog(guild, title, description) {
  const channel = getLogChannel(guild);

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(config.EMBED_COLOR || 0x2b2d31)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  await channel.send({
    embeds: [embed]
  }).catch(() => {});
}

function memberCanManageTickets(interaction) {
  if (!interaction.member) return false;

  if (
    interaction.member.permissions &&
    interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return true;
  }

  if (!interaction.member.roles) return false;

  return ticketStaffRoles.some(roleId =>
    interaction.member.roles.cache.has(roleId)
  );
}

function ticketPermissionOverwrites(guild, userId) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },
    {
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles
      ]
    }
  ];

  for (const roleId of ticketStaffRoles) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  }

  return overwrites;
}

/* ========================================
   KOMENDY SLASH
======================================== */

const commands = [
  new SlashCommandBuilder()
    .setName("weryfikacja")
    .setDescription("Wysyła panel weryfikacji"),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Wysyła panel ticketów"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Usuwa wiadomości")
    .addIntegerOption(option =>
      option
        .setName("ilosc")
        .setDescription("Liczba wiadomości 1-100")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banuje użytkownika")
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
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Wyrzuca użytkownika")
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
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Wycisza użytkownika")
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Zdejmuje wyciszenie")
    .addUserOption(option =>
      option
        .setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot wysyła wiadomość")
    .addStringOption(option =>
      option
        .setName("tekst")
        .setDescription("Treść wiadomości")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Pokazuje informacje o serwerze")
].map(command => command.toJSON());

/* ========================================
   AUTOMATYCZNY WARN ZA SPAM
   5 IDENTYCZNYCH WIADOMOŚCI
======================================== */

async function giveAutoWarn(message) {
  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("⚠️ Automatyczny WARN")
    .setDescription(
      `${message.author} otrzymał **automatycznego warna**.\n\n` +
      `**Powód:** wysłanie 5 razy tej samej wiadomości pod rząd.`
    )
    .addFields({
      name: "Wiadomość",
      value: message.content.slice(0, 1000) || "(brak treści)"
    })
    .setTimestamp();

  await message.channel.send({
    embeds: [embed]
  }).catch(() => {});

  await sendLog(
    message.guild,
    "⚠️ Automatyczny WARN",
    `**Użytkownik:** ${message.author.tag}\n` +
    `**Powód:** 5 razy ta sama wiadomość pod rząd\n` +
    `**Kanał:** ${message.channel}\n` +
    `**Treść:** ${message.content.slice(0, 1000)}`
  );

  spamCounter.delete(message.author.id);
}

client.on("messageCreate", async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content.trim();

  if (!content) return;

  const userId = message.author.id;
  const previous = spamCounter.get(userId);

  if (previous && previous.content === content) {
    previous.count++;

    console.log(
      `${message.author.tag}: ta sama wiadomość ${previous.count}/5`
    );

    if (previous.count >= 5) {
      await giveAutoWarn(message);
    }

    return;
  }

  spamCounter.set(userId, {
    content: content,
    count: 1
  });
});

/* ========================================
   READY
======================================== */

client.once("ready", async () => {
  console.log(`Zalogowano jako ${client.user.tag}`);

  const guild = client.guilds.cache.get(config.GUILD_ID);

  if (!guild) {
    console.log(
      "Nie znaleziono GUILD_ID. Sprawdź src/config.js."
    );
    return;
  }

  await guild.commands.set(commands);

  console.log("Komendy slash zostały zarejestrowane.");
  console.log("Automatyczny WARN: 5 takich samych wiadomości.");
});

/* ========================================
   POWITANIA
======================================== */

client.on("guildMemberAdd", async member => {
  if (isConfigured(config.WELCOME_CHANNEL_ID)) {
    const channel = member.guild.channels.cache.get(
      config.WELCOME_CHANNEL_ID
    );

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(config.EMBED_COLOR || 0x2b2d31)
        .setTitle("👋 Witamy na serwerze!")
        .setDescription(
          `Witaj ${member}! Miło Cię widzieć na **${member.guild.name}**.`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      await channel.send({
        embeds: [embed]
      }).catch(() => {});
    }
  }

  await sendLog(
    member.guild,
    "📥 Nowy użytkownik",
    `${member.user.tag} dołączył na serwer.`
  );
});

client.on("guildMemberRemove", async member => {
  await sendLog(
    member.guild,
    "📤 Użytkownik wyszedł",
    `${member.user.tag} opuścił serwer.`
  );
});

/* ========================================
   USUNIĘCIE WIADOMOŚCI
======================================== */

client.on("messageDelete", async message => {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const content =
    message.content?.slice(0, 1000) || "(brak treści)";

  await sendLog(
    message.guild,
    "🗑️ Usunięto wiadomość",
    `**Autor:** ${message.author?.tag || "nieznany"}\n` +
    `**Kanał:** ${message.channel}\n` +
    `**Treść:** ${content}`
  );
});

/* ========================================
   INTERAKCJE
======================================== */

client.on("interactionCreate", async interaction => {
  try {

    /* ====================================
       KOMENDY
    ==================================== */

    if (interaction.isChatInputCommand()) {

      /* WERYFIKACJA */

      if (interaction.commandName === "weryfikacja") {
        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR || 0x2b2d31)
          .setTitle("✅ Weryfikacja")
          .setDescription(
            "Kliknij przycisk poniżej, aby się zweryfikować."
          );

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("verify")
              .setLabel("Zweryfikuj się")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success)
          );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      /* PANEL TICKETÓW */

      if (interaction.commandName === "ticket") {
        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR || 0x2b2d31)
          .setTitle("🎫 Centrum pomocy")
          .setDescription(
            "Potrzebujesz pomocy? Wybierz poniżej rodzaj ticketu.\n\n" +
            "🚪 **Pomoc z wejściem na serwer**\n" +
            "🚨 **Zgłoszenie gracza**\n" +
            "🎥 **Media & Twórca**\n" +
            "🤝 **Współpraca**\n\n" +
            "Po wybraniu kategorii otworzy się formularz."
          )
          .setFooter({
            text: "Minestar • Centrum pomocy"
          });

        const menu = new StringSelectMenuBuilder()
          .setCustomId("ticket_category")
          .setPlaceholder("🎫 Wybierz rodzaj ticketu")
          .addOptions(
            {
              label: "Pomoc z wejściem na serwer",
              description: "Problem z wejściem lub dołączeniem",
              value: "pomoc",
              emoji: "🚪"
            },
            {
              label: "Zgłoszenie gracza",
              description: "Zgłoś innego gracza administracji",
              value: "gracz",
              emoji: "🚨"
            },
            {
              label: "Media & Twórca",
              description: "Ranga Media, Twórca i sprawy medialne",
              value: "media",
              emoji: "🎥"
            },
            {
              label: "Współpraca",
              description: "Propozycje współpracy",
              value: "wspolpraca",
              emoji: "🤝"
            }
          );

        const row = new ActionRowBuilder()
          .addComponents(menu);

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      /* CLEAR */

      if (interaction.commandName === "clear") {
        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.ManageMessages
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień.",
            flags: MessageFlags.Ephemeral
          });
        }

        const amount =
          interaction.options.getInteger("ilosc");

        const deleted =
          await interaction.channel.bulkDelete(
            amount,
            true
          );

        return interaction.reply({
          content:
            `🧹 Usunięto **${deleted.size}** wiadomości.`,
          flags: MessageFlags.Ephemeral
        });
      }

      /* BAN */

      if (interaction.commandName === "ban") {
        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.BanMembers
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień.",
            flags: MessageFlags.Ephemeral
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const reason =
          interaction.options.getString("powod") ||
          "Brak powodu";

        const member =
          await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content:
              "❌ Nie znaleziono użytkownika na serwerze.",
            flags: MessageFlags.Ephemeral
          });
        }

        await member.ban({ reason });

        await interaction.reply(
          `🔨 **${user.tag}** został zbanowany.\n**Powód:** ${reason}`
        );

        await sendLog(
          interaction.guild,
          "🔨 Ban",
          `**Użytkownik:** ${user.tag}\n` +
          `**Administrator:** ${interaction.user.tag}\n` +
          `**Powód:** ${reason}`
        );

        return;
      }

      /* KICK */

      if (interaction.commandName === "kick") {
        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.KickMembers
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień.",
            flags: MessageFlags.Ephemeral
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const reason =
          interaction.options.getString("powod") ||
          "Brak powodu";

        const member =
          await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            flags: MessageFlags.Ephemeral
          });
        }

        await member.kick(reason);

        await interaction.reply(
          `👢 **${user.tag}** został wyrzucony.\n**Powód:** ${reason}`
        );

        await sendLog(
          interaction.guild,
          "👢 Kick",
          `**Użytkownik:** ${user.tag}\n` +
          `**Administrator:** ${interaction.user.tag}\n` +
          `**Powód:** ${reason}`
        );

        return;
      }

      /* MUTE */

      if (interaction.commandName === "mute") {
        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.ModerateMembers
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień.",
            flags: MessageFlags.Ephemeral
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const member =
          await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            flags: MessageFlags.Ephemeral
          });
        }

        await member.timeout(
          10 * 60 * 1000,
          `Mute przez ${interaction.user.tag}`
        );

        await interaction.reply(
          `🔇 **${user.tag}** został wyciszony na 10 minut.`
        );

        return;
      }

      /* UNMUTE */

      if (interaction.commandName === "unmute") {
        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.ModerateMembers
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień.",
            flags: MessageFlags.Ephemeral
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const member =
          await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        if (!member) {
          return interaction.reply({
            content: "❌ Nie znaleziono użytkownika.",
            flags: MessageFlags.Ephemeral
          });
        }

        await member.timeout(null);

        await interaction.reply(
          `🔊 **${user.tag}** może już pisać.`
        );

        return;
      }

      /* SAY */

      if (interaction.commandName === "say") {
        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.ManageMessages
          )
        ) {
          return interaction.reply({
            content: "❌ Nie masz uprawnień.",
            flags: MessageFlags.Ephemeral
          });
        }

        const text =
          interaction.options.getString("tekst");

        await interaction.reply({
          content: "✅ Wysłano.",
          flags: MessageFlags.Ephemeral
        });

        return interaction.channel.send(text);
      }

      /* SERVERINFO */

      if (interaction.commandName === "serverinfo") {
        const guild = interaction.guild;

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR || 0x2b2d31)
          .setTitle(`📊 ${guild.name}`)
          .setThumbnail(guild.iconURL() || null)
          .addFields(
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
              name: "🆔 ID",
              value: guild.id,
              inline: true
            }
          )
          .setTimestamp();

        return interaction.reply({
          embeds: [embed]
        });
      }
    }

    /* ====================================
       MENU TICKETÓW
    ==================================== */

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== "ticket_category") {
        return;
      }

      const categoryType = interaction.values[0];
      const ticketInfo = ticketTypes[categoryType];

      if (!ticketInfo) {
        return interaction.reply({
          content: "❌ Nieprawidłowa kategoria ticketu.",
          flags: MessageFlags.Ephemeral
        });
      }

      const existing = interaction.guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildText &&
          channel.topic &&
          channel.topic.includes(`TICKET_OWNER:${interaction.user.id}`)
      );

      if (existing) {
        return interaction.reply({
          content:
            `🚫 Masz już otwarty ticket: ${existing}`,
          flags: MessageFlags.Ephemeral
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${categoryType}`)
        .setTitle(`${ticketInfo.emoji} ${ticketInfo.name}`);

      const problemInput = new TextInputBuilder()
        .setCustomId("problem")
        .setLabel("Opisz swój problem")
        .setPlaceholder("Napisz dokładnie, w czym potrzebujesz pomocy...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const nickInput = new TextInputBuilder()
        .setCustomId("nick")
        .setLabel("Twój nick na serwerze")
        .setPlaceholder("Np. Steve123")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const extraInput = new TextInputBuilder()
        .setCustomId("extra")
        .setLabel("Dodatkowe informacje / screen")
        .setPlaceholder("Możesz wpisać link do screena lub dodatkowe informacje.")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(problemInput),
        new ActionRowBuilder().addComponents(nickInput),
        new ActionRowBuilder().addComponents(extraInput)
      );

      return interaction.showModal(modal);
    }

    /* ====================================
       FORMULARZ TICKETA
    ==================================== */

    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith("ticket_modal_")) {
        return;
      }

      const categoryType =
        interaction.customId.replace("ticket_modal_", "");

      const ticketInfo = ticketTypes[categoryType];

      if (!ticketInfo) {
        return interaction.reply({
          content: "❌ Nieprawidłowa kategoria.",
          flags: MessageFlags.Ephemeral
        });
      }

      const existing = interaction.guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildText &&
          channel.topic &&
          channel.topic.includes(`TICKET_OWNER:${interaction.user.id}`)
      );

      if (existing) {
        return interaction.reply({
          content:
            `🚫 Masz już otwarty ticket: ${existing}`,
          flags: MessageFlags.Ephemeral
        });
      }

      const problem =
        interaction.fields.getTextInputValue("problem");

      const nick =
        interaction.fields.getTextInputValue("nick");

      const extra =
        interaction.fields.getTextInputValue("extra") ||
        "Brak dodatkowych informacji.";

      const channelName =
        `ticket-${interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 15)}-${interaction.user.id.slice(-4)}`;

      const channel =
        await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: isConfigured(config.TICKET_CATEGORY_ID)
            ? config.TICKET_CATEGORY_ID
            : null,
          topic:
            `TICKET_OWNER:${interaction.user.id} | TYPE:${categoryType}`,
          permissionOverwrites:
            ticketPermissionOverwrites(
              interaction.guild,
              interaction.user.id
            )
        });

      ticketOwners.set(channel.id, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(config.EMBED_COLOR || 0x2b2d31)
        .setTitle(`${ticketInfo.emoji} ${ticketInfo.name}`)
        .setDescription(
          `Witaj ${interaction.user}!\n\n` +
          `Twój ticket został utworzony. Administracja odpowie tak szybko, jak będzie mogła.`
        )
        .addFields(
          {
            name: "👤 Autor",
            value: `${interaction.user}`,
            inline: true
          },
          {
            name: "🎫 Kategoria",
            value: ticketInfo.name,
            inline: true
          },
          {
            name: "🎮 Nick",
            value: nick,
            inline: true
          },
          {
            name: "📝 Problem",
            value: problem.slice(0, 1024)
          },
          {
            name: "📎 Dodatkowe informacje / screen",
            value: extra.slice(0, 1024)
          }
        )
        .setFooter({
          text: "Minestar • System Ticketów"
        })
        .setTimestamp();

      const buttons =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("claim_ticket")
            .setLabel("Przejmij ticket")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Zamknij ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        content:
          `${interaction.user}\n` +
          `🛡️ **Administracja:** ticket oczekuje na odpowiedź.`,
        embeds: [embed],
        components: [buttons]
      });

      await sendLog(
        interaction.guild,
        "🎫 Utworzono ticket",
        `**Użytkownik:** ${interaction.user.tag}\n` +
        `**Kategoria:** ${ticketInfo.name}\n` +
        `**Kanał:** ${channel}`
      );

      return interaction.reply({
        content:
          `✅ Utworzono ticket: ${channel}`,
        flags: MessageFlags.Ephemeral
      });
    }

    /* ====================================
       PRZYCISKI
    ==================================== */

    if (interaction.isButton()) {

      /* WERYFIKACJA */

      if (interaction.customId === "verify") {
        if (!isConfigured(config.VERIFIED_ROLE_ID)) {
          return interaction.reply({
            content:
              "⚠️ Nie ustawiono VERIFIED_ROLE_ID w config.js.",
            flags: MessageFlags.Ephemeral
          });
        }

        const role =
          interaction.guild.roles.cache.get(
            config.VERIFIED_ROLE_ID
          );

        if (!role) {
          return interaction.reply({
            content:
              "❌ Nie znaleziono roli weryfikacyjnej.",
            flags: MessageFlags.Ephemeral
          });
        }

        if (
          interaction.member.roles.cache.has(role.id)
        ) {
          return interaction.reply({
            content:
              "ℹ️ Jesteś już zweryfikowany.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.member.roles.add(role);

        return interaction.reply({
          content:
            "✅ Zostałeś pomyślnie zweryfikowany!",
          flags: MessageFlags.Ephemeral
        });
      }

      /* PRZEJĘCIE TICKETA */

      if (interaction.customId === "claim_ticket") {
        if (!memberCanManageTickets(interaction)) {
          return interaction.reply({
            content:
              "❌ Tylko CEO, ADMIN, MODERATOR, POMOCNIK lub HADMIN może przejąć ticket.",
            flags: MessageFlags.Ephemeral
          });
        }

        const channel = interaction.channel;

        if (
          !channel ||
          channel.type !== ChannelType.GuildText
        ) {
          return interaction.reply({
            content: "❌ To nie jest ticket.",
            flags: MessageFlags.Ephemeral
          });
        }

        const claimedTopic =
          channel.topic &&
          channel.topic.includes("CLAIMED_BY:");

        if (claimedTopic) {
          return interaction.reply({
            content:
              "📋 Ten ticket został już przejęty przez inną osobę.",
            flags: MessageFlags.Ephemeral
          });
        }

        const newTopic =
          `${channel.topic || ""} | CLAIMED_BY:${interaction.user.id}`;

        await channel.setTopic(newTopic);

        const embed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("📋 Ticket przejęty")
          .setDescription(
            `Ten ticket został przejęty przez ${interaction.user}.\n\n` +
            `Od teraz ta osoba zajmuje się zgłoszeniem.`
          )
          .setTimestamp();

        await channel.send({
          embeds: [embed]
        });

        await sendLog(
          interaction.guild,
          "📋 Przejęto ticket",
          `**Ticket:** ${channel}\n` +
          `**Przejął:** ${interaction.user.tag}`
        );

        return interaction.reply({
          content: "✅ Przejąłeś ten ticket.",
          flags: MessageFlags.Ephemeral
        });
      }

      /* ZAMKNIĘCIE TICKETA */

      if (interaction.customId === "close_ticket") {
        const channel = interaction.channel;

        if (
          !channel ||
          channel.type !== ChannelType.GuildText
        ) {
          return interaction.reply({
            content: "❌ To nie jest ticket.",
            flags: MessageFlags.Ephemeral
          });
        }

        const isTicket =
          channel.name.startsWith("ticket-") ||
          (channel.topic &&
            channel.topic.includes("TICKET_OWNER:"));

        if (!isTicket) {
          return interaction.reply({
            content: "❌ To nie jest ticket.",
            flags: MessageFlags.Ephemeral
          });
        }

        const ownerId =
          ticketOwners.get(channel.id) ||
          (
            channel.topic &&
            channel.topic.match(/TICKET_OWNER:(\d+)/)
          )?.[1];

        const canClose =
          memberCanManageTickets(interaction) ||
          ownerId === interaction.user.id;

        if (!canClose) {
          return interaction.reply({
            content:
              "❌ Nie możesz zamknąć tego ticketu.",
            flags: MessageFlags.Ephemeral
          });
        }

        await interaction.reply(
          "🔒 Ticket zostanie usunięty za **5 sekund**."
        );

        await sendLog(
          interaction.guild,
          "🔒 Zamknięto ticket",
          `**Ticket:** ${channel.name}\n` +
          `**Zamknął:** ${interaction.user.tag}`
        );

        ticketOwners.delete(channel.id);

        setTimeout(() => {
          channel.delete().catch(() => {});
        }, 5000);

        return;
      }
    }

  } catch (error) {
    console.error(error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content:
          "❌ Wystąpił błąd. Sprawdź logi Render.",
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

/* ========================================
   LOGOWANIE
======================================== */

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ Brak DISCORD_TOKEN. Ustaw zmienną środowiskową DISCORD_TOKEN."
  );

  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
