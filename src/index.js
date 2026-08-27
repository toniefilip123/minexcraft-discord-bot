```js
const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot Discord działa!");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Serwer HTTP działa na porcie ${PORT}`);
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

// =====================================================
// WARNS
// =====================================================

const warns = new Map();

function getWarns(userId) {
  return warns.get(userId) || [];
}

function addWarn(userId, moderator, reason) {
  const userWarns = getWarns(userId);

  userWarns.push({
    moderator,
    reason,
    date: new Date()
  });

  warns.set(userId, userWarns);

  return userWarns.length;
}

function clearWarns(userId) {
  warns.delete(userId);
}

// =====================================================
// AUTOMATYCZNE POWTÓRZONE WIADOMOŚCI
// 3 IDENTYCZNE WIADOMOŚCI POD RZĄD = WARN
// =====================================================

const repeatedMessages = new Map();

function normalizeMessage(content) {
  return content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// =====================================================
// KOMENDY
// =====================================================

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
    .addIntegerOption(o =>
      o.setName("ilosc")
        .setDescription("Liczba wiadomości 1-100")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banuje użytkownika")
    .addUserOption(o =>
      o.setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("powod")
        .setDescription("Powód")
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Wyrzuca użytkownika")
    .addUserOption(o =>
      o.setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("powod")
        .setDescription("Powód")
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Wycisza użytkownika")
    .addUserOption(o =>
      o.setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Zdejmuje wyciszenie")
    .addUserOption(o =>
      o.setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Bot wysyła wiadomość")
    .addStringOption(o =>
      o.setName("tekst")
        .setDescription("Treść")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Pokazuje informacje o serwerze"),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Nadaje ostrzeżenie użytkownikowi")
    .addUserOption(o =>
      o.setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("powod")
        .setDescription("Powód ostrzeżenia")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warns")
    .setDescription("Pokazuje ostrzeżenia użytkownika")
    .addUserOption(o =>
      o.setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Usuwa wszystkie ostrzeżenia użytkownika")
    .addUserOption(o =>
      o.setName("uzytkownik")
        .setDescription("Użytkownik")
        .setRequired(true)
    )
].map(c => c.toJSON());

// =====================================================
// FUNKCJE
// =====================================================

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

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {
  console.log(`Zalogowano jako ${client.user.tag}`);

  const guild = client.guilds.cache.get(config.GUILD_ID);

  if (!guild) {
    console.log("Nie znaleziono GUILD_ID. Sprawdź src/config.js.");
    return;
  }

  await guild.commands.set(commands);

  console.log("Komendy slash zostały zarejestrowane.");
});

// =====================================================
// AUTOMATYCZNY WARN ZA 3 IDENTYCZNE WIADOMOŚCI
// =====================================================

client.on("messageCreate", async message => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const content = normalizeMessage(message.content);

    // Puste wiadomości pomijamy
    if (!content) return;

    const key = `${message.guild.id}-${message.author.id}`;

    const previous = repeatedMessages.get(key);

    if (!previous || previous.content !== content) {
      repeatedMessages.set(key, {
        content: content,
        count: 1
      });

      return;
    }

    previous.count++;

    // 3 takie same wiadomości
    if (previous.count >= 3) {

      const count = addWarn(
        message.author.id,
        "AUTOMOD",
        "Wysłanie 3 identycznych wiadomości pod rząd."
      );

      // Usuwamy trzecią wiadomość
      await message.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0xffcc00)
        .setTitle("⚠️ Automatyczny warn")
        .setDescription(
          `**${message.author.tag}** otrzymał automatycznego warna za spam.`
        )
        .addFields(
          {
            name: "Powód",
            value: "3 identyczne wiadomości pod rząd."
          },
          {
            name: "Liczba warnów",
            value: `${count}`
          }
        )
        .setTimestamp();

      await message.channel.send({
        embeds: [embed]
      }).then(msg => {
        setTimeout(() => {
          msg.delete().catch(() => {});
        }, 5000);
      }).catch(() => {});

      await sendLog(
        message.guild,
        "⚠️ Automatyczny warn",
        `**Użytkownik:** ${message.author.tag}\n` +
        `**Powód:** 3 identyczne wiadomości pod rząd.\n` +
        `**Liczba warnów:** ${count}`
      );

      // Reset licznika
      repeatedMessages.delete(key);
    }

  } catch (error) {
    console.error("Błąd automatycznego warna:", error);
  }
});

// =====================================================
// NOWY UŻYTKOWNIK
// =====================================================

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

// =====================================================
// UŻYTKOWNIK WYSZEDŁ
// =====================================================

client.on("guildMemberRemove", async member => {

  await sendLog(
    member.guild,
    "📤 Użytkownik wyszedł",
    `${member.user.tag} opuścił serwer.`
  );

});

// =====================================================
// USUNIĘTA WIADOMOŚĆ
// =====================================================

client.on("messageDelete", async message => {

  if (!message.guild || message.author?.bot) return;

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

// =====================================================
// INTERAKCJE
// =====================================================

client.on("interactionCreate", async interaction => {

  try {

    // =================================================
    // KOMENDY SLASH
    // =================================================

    if (interaction.isChatInputCommand()) {

      // =================================================
      // WERYFIKACJA
      // =================================================

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

      // =================================================
      // TICKET
      // =================================================

      if (interaction.commandName === "ticket") {

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 Centrum pomocy")
          .setDescription(
            "Potrzebujesz pomocy? Kliknij przycisk, aby utworzyć ticket."
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("create_ticket")
            .setLabel("Utwórz ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      // =================================================
      // CLEAR
      // =================================================

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
          await interaction.channel.bulkDelete(amount, true);

        return interaction.reply({
          content:
            `🧹 Usunięto **${deleted.size}** wiadomości.`,
          ephemeral: true
        });
      }

      // =================================================
      // BAN
      // =================================================

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
          reason
        });

        await interaction.reply(
          `🔨 **${user.tag}** został zbanowany. Powód: ${reason}`
        );

        return sendLog(
          interaction.guild,
          "🔨 Ban",
          `**${user.tag}** został zbanowany przez ${interaction.user.tag}.\n` +
          `Powód: ${reason}`
        );
      }

      // =================================================
      // KICK
      // =================================================

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
            content:
              "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.kick(reason);

        return interaction.reply(
          `👢 **${user.tag}** został wyrzucony. Powód: ${reason}`
        );
      }

      // =================================================
      // MUTE
      // =================================================

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
            content:
              "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.timeout(
          10 * 60 * 1000,
          `Mute przez ${interaction.user.tag}`
        );

        return interaction.reply(
          `🔇 **${user.tag}** został wyciszony na 10 minut.`
        );
      }

      // =================================================
      // UNMUTE
      // =================================================

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
            content:
              "❌ Nie znaleziono użytkownika.",
            ephemeral: true
          });
        }

        await member.timeout(null);

        return interaction.reply(
          `🔊 **${user.tag}** może już pisać.`
        );
      }

      // =================================================
      // SAY
      // =================================================

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

      // =================================================
      // SERVERINFO
      // =================================================

      if (interaction.commandName === "serverinfo") {

        const guild = interaction.guild;

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle(`📊 ${guild.name}`)
          .setThumbnail(guild.iconURL())
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

      // =================================================
      // WARN
      // =================================================

      if (interaction.commandName === "warn") {

        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.ModerateMembers
          )
        ) {
          return interaction.reply({
            content:
              "❌ Nie masz uprawnień do warnowania.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const reason =
          interaction.options.getString("powod");

        const count =
          addWarn(
            user.id,
            interaction.user.tag,
            reason
          );

        const embed = new EmbedBuilder()
          .setColor(0xffcc00)
          .setTitle("⚠️ Ostrzeżenie")
          .setDescription(
            `Użytkownik **${user.tag}** otrzymał ostrzeżenie.`
          )
          .addFields(
            {
              name: "Powód",
              value: reason
            },
            {
              name: "Liczba warnów",
              value: `${count}`
            },
            {
              name: "Moderator",
              value: interaction.user.tag
            }
          )
          .setTimestamp();

        await interaction.reply({
          embeds: [embed]
        });

        return sendLog(
          interaction.guild,
          "⚠️ Warn",
          `**${user.tag}** otrzymał warna od **${interaction.user.tag}**.\n` +
          `**Powód:** ${reason}\n` +
          `**Liczba warnów:** ${count}`
        );
      }

      // =================================================
      // WARNS
      // =================================================

      if (interaction.commandName === "warns") {

        const user =
          interaction.options.getUser("uzytkownik");

        const userWarns =
          getWarns(user.id);

        if (userWarns.length === 0) {
          return interaction.reply({
            content:
              `✅ **${user.tag}** nie ma żadnych warnów.`,
            ephemeral: true
          });
        }

        const list = userWarns
          .map(
            (warn, index) =>
              `**${index + 1}.** ${warn.reason}\n` +
              `👮 Moderator: ${warn.moderator}`
          )
          .join("\n\n");

        const embed = new EmbedBuilder()
          .setColor(0xffcc00)
          .setTitle(`⚠️ Warny — ${user.tag}`)
          .setDescription(list)
          .setFooter({
            text:
              `Liczba warnów: ${userWarns.length}`
          })
          .setTimestamp();

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      // =================================================
      // CLEARWARNS
      // =================================================

      if (interaction.commandName === "clearwarns") {

        if (
          !interaction.memberPermissions.has(
            PermissionsBitField.Flags.ModerateMembers
          )
        ) {
          return interaction.reply({
            content:
              "❌ Nie masz uprawnień do usuwania warnów.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("uzytkownik");

        const oldCount =
          getWarns(user.id).length;

        clearWarns(user.id);

        await interaction.reply({
          content:
            `🧹 Usunięto **${oldCount}** warnów użytkownika **${user.tag}**.`
        });

        return sendLog(
          interaction.guild,
          "🧹 Usunięto warny",
          `Warny użytkownika **${user.tag}** zostały usunięte przez **${interaction.user.tag}**.`
        );
      }
    }

    // =================================================
    // PRZYCISKI
    // =================================================

    if (interaction.isButton()) {

      // =================================================
      // VERIFY
      // =================================================

      if (interaction.customId === "verify") {

        if (!isConfigured(config.VERIFIED_ROLE_ID)) {
          return interaction.reply({
            content:
              "⚠️ Administrator nie ustawił jeszcze VERIFIED_ROLE_ID.",
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
          content:
            "✅ Zostałeś zweryfikowany!",
          ephemeral: true
        });
      }

      // =================================================
      // CREATE TICKET
      // =================================================

      if (interaction.customId === "create_ticket") {

        const existing =
          interaction.guild.channels.cache.find(
            c =>
              c.type === ChannelType.GuildText &&
              c.name === `ticket-${interaction.user.id}`
          );

        if (existing) {
          return interaction.reply({
            content:
              `Masz już ticket: ${existing}`,
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
          },

          {
            id: config.CEO_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },

          {
            id: config.ADMIN_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },

          {
            id: config.MODERATOR_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },

          {
            id: config.POMOCNIK_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },

          {
            id: config.HADMIN_ROLE_ID,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }
        ];

        const channel =
          await interaction.guild.channels.create({
            name: `ticket-${interaction.user.id}`,
            type: ChannelType.GuildText,
            parent: config.TICKET_CATEGORY_ID,
            permissionOverwrites: overwrites
          });

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 Ticket")
          .setDescription(
            "Opisz swój problem. Administracja odpowie tak szybko, jak będzie mogła."
          );

        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("close_ticket")
              .setLabel("Zamknij ticket")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );

        await channel.send({
          content: `${interaction.user}`,
          embeds: [embed],
          components: [row]
        });

        return interaction.reply({
          content:
            `✅ Utworzono ticket: ${channel}`,
          ephemeral: true
        });
      }

      // =================================================
      // CLOSE TICKET
      // =================================================

      if (interaction.customId === "close_ticket") {

        await interaction.reply(
          "🔒 Ticket zostanie zamknięty za 3 sekundy."
        );

        setTimeout(() => {
          interaction.channel
            .delete()
            .catch(() => {});
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
        content: "❌ Wystąpił błąd.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// =====================================================
// TOKEN
// =====================================================

if (!process.env.DISCORD_TOKEN) {

  console.error(
    "Brak DISCORD_TOKEN. Ustaw zmienną środowiskową DISCORD_TOKEN."
  );

  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
```
