const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder
} = require("discord.js");

const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

/* ================================
   POMOCNICZE
================================ */

function isConfigured(value) {
  return value && !String(value).startsWith("WSTAW_");
}

function getLogChannel(guild) {
  if (!isConfigured(config.LOG_CHANNEL_ID)) return null;
  return guild.channels.cache.get(config.LOG_CHANNEL_ID) || null;
}

async function sendLog(guild, title, description) {
  const channel = getLogChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(config.EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

/* ================================
   RANGI MAJĄCE DOSTĘP DO TICKETÓW
================================ */

function getStaffRoleIds() {
  return [
    config.CEO_ROLE_ID,
    config.ADMIN_ROLE_ID,
    config.MODERATOR_ROLE_ID,
    config.POMOCNIK_ROLE_ID,
    config.HADMIN_ROLE_ID
  ].filter(isConfigured);
}

function isTicketStaff(member) {
  if (!member || !member.roles) return false;

  return getStaffRoleIds().some(roleId =>
    member.roles.cache.has(roleId)
  );
}

/* ================================
   KATEGORIE TICKETÓW
================================ */

const ticketTypes = {
  wejscie: {
    label: "Pomoc z wejściem na serwer",
    emoji: "🛠️",
    channel: "pomoc-wejscie",
    title: "🛠️ Pomoc z wejściem na serwer",
    description:
      "Opisz problem z wejściem na serwer. Podaj swój nick oraz dokładny opis problemu."
  },

  zgloszenie: {
    label: "Zgłoszenie gracza",
    emoji: "🚨",
    channel: "zgloszenie-gracza",
    title: "🚨 Zgłoszenie gracza",
    description:
      "Podaj nick zgłaszanego gracza, opisz sytuację i dodaj screenshot, jeżeli go posiadasz."
  },

  blad: {
    label: "Zgłoszenie błędu",
    emoji: "🐛",
    channel: "zgloszenie-bledu",
    title: "🐛 Zgłoszenie błędu",
    description:
      "Opisz dokładnie znaleziony błąd. Możesz również dodać screenshot."
  },

  sklep: {
    label: "Sklep / płatności",
    emoji: "💰",
    channel: "sklep-platnosci",
    title: "💰 Sklep / płatności",
    description:
      "Opisz problem związany ze sklepem, zakupem lub płatnością."
  },

  media: {
    label: "Media & Twórca",
    emoji: "📸",
    channel: "media-tworca",
    title: "📸 Media & Twórca",
    description:
      "Podaj nick, link do kanału/profilu oraz informacje dotyczące rangi Media lub Twórcy."
  },

  wspolpraca: {
    label: "Współpraca",
    emoji: "🤝",
    channel: "wspolpraca",
    title: "🤝 Współpraca",
    description:
      "Opisz propozycję współpracy i podaj najważniejsze informacje."
  },

  inna: {
    label: "Inna pomoc",
    emoji: "❓",
    channel: "inna-pomoc",
    title: "❓ Inna pomoc",
    description:
      "Opisz dokładnie, w czym potrzebujesz pomocy."
  }
};

/* ================================
   KOMENDY
================================ */

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
        .setDescription("Treść")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Pokazuje informacje o serwerze")
].map(command => command.toJSON());

/* ================================
   READY
================================ */

client.once("ready", async () => {
  console.log("Zalogowano jako " + client.user.tag);

  const guild = client.guilds.cache.get(config.GUILD_ID);

  if (!guild) {
    console.log("Nie znaleziono GUILD_ID.");
    return;
  }

  await guild.commands.set(commands);

  console.log("Komendy slash zostały zarejestrowane.");
  console.log("System ticketów jest gotowy.");
});

/* ================================
   POWITANIA
================================ */

client.on("guildMemberAdd", async member => {
  if (isConfigured(config.WELCOME_CHANNEL_ID)) {
    const channel = member.guild.channels.cache.get(
      config.WELCOME_CHANNEL_ID
    );

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(config.EMBED_COLOR)
        .setTitle("👋 Witamy na serwerze!")
        .setDescription(
          "Witaj " +
            member +
            "! Miło Cię widzieć na **" +
            member.guild.name +
            "**."
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  await sendLog(
    member.guild,
    "📥 Nowy użytkownik",
    member.user.tag + " dołączył na serwer."
  );
});

client.on("guildMemberRemove", async member => {
  await sendLog(
    member.guild,
    "📤 Użytkownik wyszedł",
    member.user.tag + " opuścił serwer."
  );
});

/* ================================
   AUTOMATYCZNY WARN ZA SPAM
   5 TAKICH SAMYCH WIADOMOŚCI
================================ */

const spamCounter = new Map();

client.on("messageCreate", async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content.trim();

  if (!content) return;

  const userId = message.author.id;
  const previous = spamCounter.get(userId);

  if (previous && previous.content === content) {
    previous.count++;

    spamCounter.set(userId, previous);

    console.log(
      message.author.tag +
        ": ta sama wiadomość " +
        previous.count +
        "/5"
    );

    if (previous.count >= 5) {
      await message.channel
        .send(
          "⚠️ " +
            message.author +
            " otrzymał **automatycznego WARNA** za wysłanie 5 razy tej samej wiadomości."
        )
        .catch(() => {});

      await sendLog(
        message.guild,
        "⚠️ Automatyczny WARN",
        "**Użytkownik:** " +
          message.author.tag +
          "\n**Powód:** 5 razy ta sama wiadomość pod rząd\n**Wiadomość:** " +
          content.slice(0, 1000)
      );

      spamCounter.delete(userId);
    }

    return;
  }

  spamCounter.set(userId, {
    content: content,
    count: 1
  });
});

/* ================================
   USUWANIE WIADOMOŚCI
================================ */

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  const content =
    message.content?.slice(0, 1000) || "(brak treści)";

  await sendLog(
    message.guild,
    "🗑️ Usunięto wiadomość",
    "**Autor:** " +
      (message.author?.tag || "nieznany") +
      "\n**Kanał:** " +
      message.channel +
      "\n**Treść:** " +
      content
  );
});

/* ================================
   INTERAKCJE
================================ */

client.on("interactionCreate", async interaction => {
  try {
    /* ============================
       KOMENDY SLASH
    ============================ */

    if (interaction.isChatInputCommand()) {
      /* WERYFIKACJA */

      if (interaction.commandName === "weryfikacja") {
        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("✅ Weryfikacja")
          .setDescription(
            "Kliknij przycisk poniżej, aby się zweryfikować."
          );

        const row = new ActionRowBuilder().addComponents(
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
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 Centrum pomocy")
          .setDescription(
            "Potrzebujesz pomocy?\n\n" +
              "Kliknij **Otwórz ticket**, a następnie wybierz rodzaj sprawy.\n\n" +
              "🛠️ Pomoc z wejściem na serwer\n" +
              "🚨 Zgłoszenie gracza\n" +
              "🐛 Zgłoszenie błędu\n" +
              "💰 Sklep / płatności\n" +
              "📸 Media & Twórca\n" +
              "🤝 Współpraca\n" +
              "❓ Inna pomoc"
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("open_ticket_menu")
            .setLabel("Otwórz ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary)
        );

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
            ephemeral: true
          });
        }

        const amount = interaction.options.getInteger("ilosc");

        const deleted =
          await interaction.channel.bulkDelete(amount, true);

        return interaction.reply({
          content:
            "🧹 Usunięto **" +
            deleted.size +
            "** wiadomości.",
          ephemeral: true
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
            ephemeral: true
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
            ephemeral: true
          });
        }

        await member.ban({ reason });

        await interaction.reply(
          "🔨 **" +
            user.tag +
            "** został zbanowany. Powód: " +
            reason
        );

        return sendLog(
          interaction.guild,
          "🔨 Ban",
          "**" +
            user.tag +
            "** został zbanowany przez " +
            interaction.user.tag +
            ".\nPowód: " +
            reason
        );
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
            ephemeral: true
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
            ephemeral: true
          });
        }

        await member.kick(reason);

        return interaction.reply(
          "👢 **" +
            user.tag +
            "** został wyrzucony. Powód: " +
            reason
        );
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
            ephemeral: true
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
            ephemeral: true
          });
        }

        await member.timeout(
          10 * 60 * 1000,
          "Mute przez " + interaction.user.tag
        );

        return interaction.reply(
          "🔇 **" +
            user.tag +
            "** został wyciszony na 10 minut."
        );
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
            ephemeral: true
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
            ephemeral: true
          });
        }

        await member.timeout(null);

        return interaction.reply(
          "🔊 **" +
            user.tag +
            "** może już pisać."
        );
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
            ephemeral: true
          });
        }

        const text =
          interaction.options.getString("tekst");

        await interaction.reply({
          content: "Wysłano.",
          ephemeral: true
        });

        return interaction.channel.send(text);
      }

      /* SERVERINFO */

      if (interaction.commandName === "serverinfo") {
        const guild = interaction.guild;

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("📊 " + guild.name)
          .setThumbnail(guild.iconURL())
          .addFields(
            {
              name: "👥 Członkowie",
              value: String(guild.memberCount),
              inline: true
            },
            {
              name: "💬 Kanały",
              value: String(guild.channels.cache.size),
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

    /* ============================
       PRZYCISKI
    ============================ */

    if (interaction.isButton()) {
      /* WERYFIKACJA */

      if (interaction.customId === "verify") {
        if (!isConfigured(config.VERIFIED_ROLE_ID)) {
          return interaction.reply({
            content:
              "⚠️ Administrator nie ustawił VERIFIED_ROLE_ID.",
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
              "❌ Nie znaleziono roli weryfikacyjnej.",
            ephemeral: true
          });
        }

        await interaction.member.roles.add(role);

        return interaction.reply({
          content: "✅ Zostałeś zweryfikowany!",
          ephemeral: true
        });
      }

      /* OTWÓRZ MENU TICKETÓW */

      if (interaction.customId === "open_ticket_menu") {
        const menu = new StringSelectMenuBuilder()
          .setCustomId("ticket_type")
          .setPlaceholder("🎫 Wybierz rodzaj ticketu")
          .addOptions(
            Object.entries(ticketTypes).map(
              ([value, ticket]) => ({
                label: ticket.label,
                value: value,
                emoji: ticket.emoji,
                description: ticket.description.slice(0, 100)
              })
            )
          );

        const row = new ActionRowBuilder().addComponents(
          menu
        );

        return interaction.reply({
          content: "🎫 **Wybierz rodzaj sprawy:**",
          components: [row],
          ephemeral: true
        });
      }

      /* PRZEJMIJ TICKET */

      if (interaction.customId === "claim_ticket") {
        if (!isTicketStaff(interaction.member)) {
          return interaction.reply({
            content:
              "❌ Tylko administracja obsługująca tickety może przejąć ticket.",
            ephemeral: true
          });
        }

        if (
          !interaction.channel.name.startsWith("ticket-")
        ) {
          return interaction.reply({
            content: "❌ To nie jest ticket.",
            ephemeral: true
          });
        }

        if (
          interaction.channel.topic &&
          interaction.channel.topic.includes("CLAIMED:")
        ) {
          return interaction.reply({
            content:
              "⚠️ Ten ticket został już przejęty.",
            ephemeral: true
          });
        }

        await interaction.channel.setTopic(
          "CLAIMED:" + interaction.user.id
        );

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("📋 Ticket przejęty")
          .setDescription(
            "Ticket został przejęty przez " +
              interaction.user +
              "."
          )
          .setTimestamp();

        await interaction.channel.send({
          embeds: [embed]
        });

        await sendLog(
          interaction.guild,
          "📋 Ticket przejęty",
          "**Ticket:** " +
            interaction.channel.name +
            "\n**Przejął:** " +
            interaction.user.tag
        );

        return interaction.reply({
          content: "✅ Przejąłeś ten ticket.",
          ephemeral: true
        });
      }

      /* ZAMKNIJ TICKET */

      if (interaction.customId === "close_ticket") {
        if (
          interaction.channel.name.startsWith("ticket-")
        ) {
          await interaction.reply(
            "🔒 Ticket zostanie zamknięty za 3 sekundy."
          );

          await sendLog(
            interaction.guild,
            "🔒 Ticket zamknięty",
            "**Ticket:** " +
              interaction.channel.name +
              "\n**Zamknął:** " +
              interaction.user.tag
          );

          setTimeout(() => {
            interaction.channel
              .delete()
              .catch(() => {});
          }, 3000);

          return;
        }

        return interaction.reply({
          content: "❌ To nie jest ticket.",
          ephemeral: true
        });
      }
    }

    /* ============================
       MENU WYBORU TICKETU
    ============================ */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "ticket_type"
    ) {
      const type = interaction.values[0];
      const ticket = ticketTypes[type];

      if (!ticket) {
        return interaction.reply({
          content: "❌ Nieprawidłowy rodzaj ticketu.",
          ephemeral: true
        });
      }

      const existing =
        interaction.guild.channels.cache.find(
          channel =>
            channel.type === ChannelType.GuildText &&
            channel.topic &&
            channel.topic.includes(
              "OWNER:" + interaction.user.id
            )
        );

      if (existing) {
        return interaction.reply({
          content:
            "🚫 Masz już aktywny ticket: " +
            existing,
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId("ticket_modal_" + type)
        .setTitle(ticket.label);

      const nickInput = new TextInputBuilder()
        .setCustomId("nick")
        .setLabel("Twój nick")
        .setPlaceholder("Wpisz swój nick")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const descriptionInput = new TextInputBuilder()
        .setCustomId("opis")
        .setLabel("Opisz sprawę")
        .setPlaceholder(
          "Opisz dokładnie, czego potrzebujesz"
        )
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const row1 =
        new ActionRowBuilder().addComponents(
          nickInput
        );

      const row2 =
        new ActionRowBuilder().addComponents(
          descriptionInput
        );

      modal.addComponents(row1, row2);

      return interaction.showModal(modal);
    }

    /* ============================
       FORMULARZ TICKETA
    ============================ */

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("ticket_modal_")
    ) {
      const type =
        interaction.customId.replace(
          "ticket_modal_",
          ""
        );

      const ticket = ticketTypes[type];

      if (!ticket) {
        return interaction.reply({
          content: "❌ Nieprawidłowy rodzaj ticketu.",
          ephemeral: true
        });
      }

      const existing =
        interaction.guild.channels.cache.find(
          channel =>
            channel.type === ChannelType.GuildText &&
            channel.topic &&
            channel.topic.includes(
              "OWNER:" + interaction.user.id
            )
        );

      if (existing) {
        return interaction.reply({
          content:
            "🚫 Masz już aktywny ticket: " +
            existing,
          ephemeral: true
        });
      }

      const nick =
        interaction.fields.getTextInputValue("nick");

      const opis =
        interaction.fields.getTextInputValue("opis");

      const overwrites = [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel
          ]
        },

        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles
          ]
        }
      ];

      for (const roleId of getStaffRoleIds()) {
        overwrites.push({
          id: roleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.AttachFiles
          ]
        });
      }

      const channel =
        await interaction.guild.channels.create({
          name:
            "ticket-" +
            interaction.user.username
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "")
              .slice(0, 20),
          type: ChannelType.GuildText,
          parent: config.TICKET_CATEGORY_ID,
          topic:
            "OWNER:" +
            interaction.user.id +
            " | TYPE:" +
            type,
          permissionOverwrites: overwrites
        });

      const embed = new EmbedBuilder()
        .setColor(config.EMBED_COLOR)
        .setTitle(ticket.title)
        .setDescription(ticket.description)
        .addFields(
          {
            name: "👤 Autor",
            value: interaction.user.toString(),
            inline: true
          },
          {
            name: "🎮 Nick",
            value: nick,
            inline: true
          },
          {
            name: "📝 Opis sprawy",
            value: opis,
            inline: false
          },
          {
            name: "📸 Screenshot",
            value:
              "Możesz teraz wysłać screenshot lub inny plik na tym kanale.",
            inline: false
          }
        )
        .setFooter({
          text: "Ticket • MinexCraft"
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
        content: interaction.user.toString(),
        embeds: [embed],
        components: [buttons]
      });

      await sendLog(
        interaction.guild,
        "🎫 Utworzono ticket",
        "**Ticket:** " +
          channel.name +
          "\n**Autor:** " +
          interaction.user.tag +
          "\n**Kategoria:** " +
          ticket.label
      );

      return interaction.reply({
        content:
          "✅ Utworzono ticket: " + channel,
        ephemeral: true
      });
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
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* ================================
   LOGOWANIE
================================ */

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "Brak DISCORD_TOKEN. Ustaw zmienną środowiskową DISCORD_TOKEN."
  );

  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
