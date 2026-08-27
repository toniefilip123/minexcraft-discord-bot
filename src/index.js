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

const ticketStaffRoles = [
  config.CEO_ROLE_ID,
  config.ADMIN_ROLE_ID,
  config.MODERATOR_ROLE_ID,
  config.POMOCNIK_ROLE_ID,
  config.HADMIN_ROLE_ID
];

const ticketTypes = {
  pomoc: {
    name: "Pomoc z wejściem na serwer",
    emoji: "📥"
  },
  zgloszenie: {
    name: "Zgłoszenie gracza",
    emoji: "🚨"
  },
  media: {
    name: "Media & Twórca",
    emoji: "📸"
  },
  wspolpraca: {
    name: "Współpraca",
    emoji: "🤝"
  }
};

const commands = [
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Wysyła panel ticketów"),

  new SlashCommandBuilder()
    .setName("weryfikacja")
    .setDescription("Wysyła panel weryfikacji"),

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

function isConfigured(value) {
  return value && !value.startsWith("WSTAW_");
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

  await channel.send({
    embeds: [embed]
  }).catch(() => {});
}

function hasTicketStaffRole(member) {
  return ticketStaffRoles.some(roleId =>
    member.roles.cache.has(roleId)
  );
}

client.once("ready", async () => {
  console.log("Zalogowano jako " + client.user.tag);

  const guild = client.guilds.cache.get(config.GUILD_ID);

  if (!guild) {
    console.log("Nie znaleziono GUILD_ID.");
    return;
  }

  await guild.commands.set(commands);

  console.log("Komendy slash zostały zarejestrowane.");
});

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

      await channel.send({
        embeds: [embed]
      }).catch(() => {});
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

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "ticket") {
        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 Centrum pomocy")
          .setDescription(
            "Wybierz poniżej rodzaj ticketu.\n\n" +
            "📥 **Pomoc z wejściem na serwer**\n" +
            "🚨 **Zgłoszenie gracza**\n" +
            "📸 **Media & Twórca**\n" +
            "🤝 **Współpraca**"
          )
          .setFooter({
            text: "Wybierz odpowiednią kategorię"
          });

        const menu = new StringSelectMenuBuilder()
          .setCustomId("ticket_type")
          .setPlaceholder("🎫 Wybierz rodzaj ticketu")
          .addOptions(
            {
              label: "Pomoc z wejściem na serwer",
              description: "Problem z wejściem lub dołączeniem",
              value: "pomoc",
              emoji: "📥"
            },
            {
              label: "Zgłoszenie gracza",
              description: "Zgłoś gracza administracji",
              value: "zgloszenie",
              emoji: "🚨"
            },
            {
              label: "Media & Twórca",
              description: "Sprawy związane z mediami i twórcami",
              value: "media",
              emoji: "📸"
            },
            {
              label: "Współpraca",
              description: "Propozycje współpracy",
              value: "wspolpraca",
              emoji: "🤝"
            }
          );

        const row = new ActionRowBuilder().addComponents(menu);

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

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

        const amount =
          interaction.options.getInteger("ilosc");

        const deleted =
          await interaction.channel.bulkDelete(
            amount,
            true
          );

        return interaction.reply({
          content:
            "🧹 Usunięto **" +
            deleted.size +
            "** wiadomości.",
          ephemeral: true
        });
      }

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

        await member.ban({
          reason: reason
        });

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
            ".\n**Powód:** " +
            reason
        );
      }

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

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== "ticket_type") return;

      const type = ticketTypes[interaction.values[0]];

      if (!type) {
        return interaction.reply({
          content: "❌ Nieprawidłowa kategoria.",
          ephemeral: true
        });
      }

      const existing =
        interaction.guild.channels.cache.find(
          channel =>
            channel.type === ChannelType.GuildText &&
            channel.topic === "TICKET_OWNER:" + interaction.user.id
        );

      if (existing) {
        return interaction.reply({
          content:
            "❌ Masz już otwarty ticket: " +
            existing,
          ephemeral: true
        });
      }

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
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ];

      for (const roleId of ticketStaffRoles) {
        overwrites.push({
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
            "ticket-" +
            interaction.user.username
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .slice(0, 20),
          type: ChannelType.GuildText,
          parent: config.TICKET_CATEGORY_ID,
          topic:
            "TICKET_OWNER:" +
            interaction.user.id,
          permissionOverwrites: overwrites
        });

      const embed = new EmbedBuilder()
        .setColor(config.EMBED_COLOR)
        .setTitle(
          type.emoji +
          " " +
          type.name
        )
        .setDescription(
          "### 📋 Informacje\n\n" +
          "👤 **Nick:** wpisz swój nick\n" +
          "📝 **Problem:** opisz dokładnie problem\n" +
          "📸 **Screen:** jeżeli masz, wyślij screen poniżej\n\n" +
          "🛡️ Administracja odpowie tak szybko, jak będzie mogła."
        )
        .setFooter({
          text: "Ticket • " + type.name
        })
        .setTimestamp();

      const buttons =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("claim_ticket")
            .setLabel("Przejmij ticket")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Zamknij ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        content:
          interaction.user +
          "\n📝 **Pamiętaj:** podaj nick, opisz problem i wyślij screen, jeśli go posiadasz.",
        embeds: [embed],
        components: [buttons]
      });

      await sendLog(
        interaction.guild,
        "🎫 Utworzono ticket",
        "**Użytkownik:** " +
          interaction.user.tag +
          "\n**Kategoria:** " +
          type.name +
          "\n**Kanał:** " +
          channel
      );

      return interaction.reply({
        content:
          "✅ Utworzono ticket: " +
          channel,
        ephemeral: true
      });
    }

    if (interaction.isButton()) {

      if (interaction.customId === "verify") {
        if (!isConfigured(config.VERIFIED_ROLE_ID)) {
          return interaction.reply({
            content:
              "⚠️ Nie ustawiono VERIFIED_ROLE_ID.",
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

      if (interaction.customId === "claim_ticket") {
        if (!hasTicketStaffRole(interaction.member)) {
          return interaction.reply({
            content:
              "❌ Tylko CEO, ADMIN, MODERATOR, POMOCNIK lub HADMIN może przejąć ticket.",
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("📋 Ticket przejęty")
          .setDescription(
            "Ticket został przejęty przez **" +
            interaction.user.tag +
            "**."
          )
          .setTimestamp();

        await interaction.channel.send({
          embeds: [embed]
        });

        await sendLog(
          interaction.guild,
          "📋 Przejęto ticket",
          "**Ticket:** " +
            interaction.channel +
            "\n**Przejął:** " +
            interaction.user.tag
        );

        return interaction.reply({
          content: "✅ Przejąłeś ten ticket.",
          ephemeral: true
        });
      }

      if (interaction.customId === "close_ticket") {
        const isOwner =
          interaction.channel.topic ===
          "TICKET_OWNER:" +
          interaction.user.id;

        if (
          !isOwner &&
          !hasTicketStaffRole(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ Nie masz uprawnień do zamknięcia tego ticketu.",
            ephemeral: true
          });
        }

        await interaction.reply(
          "🔒 Ticket zostanie usunięty za 3 sekundy."
        );

        await sendLog(
          interaction.guild,
          "🔒 Zamknięto ticket",
          "**Kanał:** " +
            interaction.channel.name +
            "\n**Zamknął:** " +
            interaction.user.tag
        );

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 3000);
      }
    }

  } catch (error) {
    console.error(error);

    if (
      interaction.isRepliable() &&
      !interaction.replied
    ) {
      await interaction.reply({
        content:
          "❌ Wystąpił błąd. Sprawdź logi Render.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "Brak DISCORD_TOKEN. Ustaw zmienną środowiskową DISCORD_TOKEN."
  );
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
