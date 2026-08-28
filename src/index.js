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
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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
   AUTOMATYCZNY WARN ZA 5 TAKICH SAMYCH
======================================== */

const spamCounter = new Map();

/* ========================================
   WERYFIKACJA
======================================== */

const verificationData = new Map();

function generateMathQuestion() {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;

  const operations = ["+", "-", "*"];
  const operation =
    operations[Math.floor(Math.random() * operations.length)];

  let answer;

  if (operation === "+") {
    answer = a + b;
  } else if (operation === "-") {
    answer = a - b;
  } else {
    answer = a * b;
  }

  return {
    question: `${a} ${operation} ${b}`,
    answer
  };
}

/* ========================================
   KOMENDY
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
   FUNKCJE POMOCNICZE
======================================== */

function isConfigured(value) {
  return value && !value.startsWith("WSTAW_");
}

function getLogChannel(guild) {

  if (!isConfigured(config.LOG_CHANNEL_ID)) {
    return null;
  }

  return guild.channels.cache.get(
    config.LOG_CHANNEL_ID
  ) || null;
}

async function sendLog(guild, title, description) {

  const channel = getLogChannel(guild);

  if (!channel) {
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(config.EMBED_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  await channel.send({
    embeds: [embed]
  }).catch(() => {});
}

/* ========================================
   RANGI MAJĄCE DOSTĘP DO TICKETÓW
======================================== */

function getTicketStaffRoles() {

  return [
    config.CEO_ROLE_ID,
    config.ADMIN_ROLE_ID,
    config.MODERATOR_ROLE_ID,
    config.POMOCNIK_ROLE_ID,
    config.HADMIN_ROLE_ID
  ].filter(roleId =>
    isConfigured(roleId)
  );
}

function memberCanManageTicket(member) {

  const roles = getTicketStaffRoles();

  return roles.some(roleId =>
    member.roles.cache.has(roleId)
  );
}

/* ========================================
   AUTOMATYCZNY WARN
======================================== */

async function giveAutoWarn(message) {

  await message.channel.send(
    `⚠️ ${message.author} otrzymał **automatycznego WARNA** za wysłanie 5 razy tej samej wiadomości.`
  ).catch(() => {});

  await sendLog(
    message.guild,
    "⚠️ Automatyczny WARN",
    `**Użytkownik:** ${message.author.tag}\n` +
    `**Powód:** 5 razy ta sama wiadomość pod rząd\n` +
    `**Wiadomość:** ${message.content.slice(0, 1000)}`
  );

  console.log(
    `AUTOMATYCZNY WARN: ${message.author.tag}`
  );

  spamCounter.delete(message.author.id);
}

/* ========================================
   WIADOMOŚCI
======================================== */

client.on("messageCreate", async message => {

  if (!message.guild) {
    return;
  }

  if (message.author.bot) {
    return;
  }

  const content = message.content.trim();

  if (!content) {
    return;
  }

  const userId = message.author.id;
  const previous = spamCounter.get(userId);

  if (previous && previous.content === content) {

    previous.count++;

    spamCounter.set(
      userId,
      previous
    );

    console.log(
      `${message.author.tag}: ${previous.count}/5`
    );

    if (previous.count >= 5) {
      await giveAutoWarn(message);
    }

    return;
  }

  spamCounter.set(
    userId,
    {
      content: content,
      count: 1
    }
  );
});

/* ========================================
   READY
======================================== */

client.once("clientReady", async () => {

  console.log(
    `Zalogowano jako ${client.user.tag}`
  );

  const guild = client.guilds.cache.get(
    config.GUILD_ID
  );

  if (!guild) {

    console.log(
      "Nie znaleziono GUILD_ID. Sprawdź src/config.js."
    );

    return;
  }

  await guild.commands.set(commands);

  console.log(
    "Komendy slash zostały zarejestrowane."
  );

  console.log(
    "Bot działa poprawnie."
  );
});

/* ========================================
   POWITANIA
======================================== */

client.on("guildMemberAdd", async member => {

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
          `Witaj ${member}!\n\n` +
          `Miło Cię widzieć na **${member.guild.name}**.`
        )
        .setThumbnail(
          member.user.displayAvatarURL()
        )
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
   USUWANIE WIADOMOŚCI
======================================== */

client.on("messageDelete", async message => {

  if (!message.guild) {
    return;
  }

  if (message.author?.bot) {
    return;
  }

  const content =
    message.content?.slice(0, 1000) ||
    "(brak treści)";

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

    /* ======================================
       KOMENDY SLASH
    ====================================== */

    if (interaction.isChatInputCommand()) {

      /* ====================================
         WERYFIKACJA
      ==================================== */

      if (interaction.commandName === "weryfikacja") {

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("⛏️ WERYFIKACJA MINECRAFT")
          .setDescription(
            "**Witaj na naszym serwerze!** 👋\n\n" +

            "Aby uzyskać pełny dostęp do serwera, " +
            "musisz przejść krótką weryfikację.\n\n" +

            "━━━━━━━━━━━━━━━━━━━━\n\n" +

            "### 📋 JAK SIĘ ZWERYFIKOWAĆ?\n\n" +

            "**① Kliknij „Rozpocznij weryfikację”**\n" +
            "Rozpocznij proces za pomocą przycisku poniżej.\n\n" +

            "**② Podaj swój nick z Minecrafta**\n" +
            "Wpisz dokładny nick, którego używasz w Minecraft.\n\n" +

            "**③ Rozwiąż działanie matematyczne**\n" +
            "Bot wyświetli Ci działanie. Podaj prawidłowy wynik.\n\n" +

            "**④ Odbierz rangę**\n" +
            "Po poprawnej odpowiedzi otrzymasz rangę **Zweryfikowany**.\n\n" +

            "**⑤ Gotowe! 🎉**\n" +
            "Twój pseudonim na Discordzie zostanie ustawiony na podany nick z Minecrafta.\n\n" +

            "━━━━━━━━━━━━━━━━━━━━\n\n" +

            "⚠️ **WAŻNE**\n" +
            "Podaj dokładny nick z Minecrafta.\n\n" +

            "🔒 **Bezpieczeństwo**\n" +
            "Nigdy nie podawaj hasła ani danych logowania do Minecrafta.\n\n" +

            "**Powodzenia i miłej gry! ⛏️**"
          )
          .setFooter({
            text: `${interaction.guild.name} • Weryfikacja`
          })
          .setTimestamp();

        const row =
          new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId("verify")
              .setLabel("Rozpocznij weryfikację")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success)

          );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      /* ====================================
         TICKET PANEL
      ==================================== */

      if (interaction.commandName === "ticket") {

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 CENTRUM POMOCY")
          .setDescription(
            "Potrzebujesz pomocy? Utwórz ticket, a administracja postara się odpowiedzieć jak najszybciej.\n\n" +

            "━━━━━━━━━━━━━━━━━━━━\n\n" +

            "🆘 **Pomoc z wejściem na serwer**\n" +
            "Problemy z wejściem lub połączeniem.\n\n\n" +

            "🚨 **Zgłoszenie gracza**\n" +
            "Zgłoś gracza łamiącego zasady.\n\n\n" +

            "🎥 **Media & Twórca**\n" +
            "Sprawy dotyczące rangi Media / Twórca.\n\n\n" +

            "🤝 **Współpraca**\n" +
            "Propozycje współpracy.\n\n\n" +

            "🐛 **Znalazłem błąd**\n" +
            "Zgłoś znaleziony błąd.\n\n\n" +

            "⚖️ **Odwołanie od bana**\n" +
            "Odwołaj się od nałożonej kary.\n\n\n" +

            "❓ **Inne**\n" +
            "Pozostałe sprawy.\n\n" +

            "━━━━━━━━━━━━━━━━━━━━\n\n" +

            "📸 Przygotuj **nick, opis problemu oraz screen**, jeśli jest potrzebny."
          )
          .setFooter({
            text: `${interaction.guild.name} • Centrum pomocy`
          })
          .setTimestamp();

        const row =
          new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId("create_ticket")
              .setLabel("Otwórz ticket")
              .setEmoji("🎫")
              .setStyle(ButtonStyle.Primary)

          );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      /* ====================================
         CLEAR
      ==================================== */

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
            `🧹 Usunięto **${deleted.size}** wiadomości.`,
          ephemeral: true
        });
      }

      /* ====================================
         BAN
      ==================================== */

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
          interaction.options.getUser(
            "uzytkownik"
          );

        const reason =
          interaction.options.getString(
            "powod"
          ) || "Brak powodu";

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

        await member.ban({
          reason: reason
        });

        await sendLog(
          interaction.guild,
          "🔨 Ban",
          `**Użytkownik:** ${user.tag}\n` +
          `**Moderator:** ${interaction.user.tag}\n` +
          `**Powód:** ${reason}`
        );

        return interaction.reply(
          `🔨 **${user.tag}** został zbanowany.\nPowód: ${reason}`
        );
      }

      /* ====================================
         KICK
      ==================================== */

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
          interaction.options.getUser(
            "uzytkownik"
          );

        const reason =
          interaction.options.getString(
            "powod"
          ) || "Brak powodu";

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

        await sendLog(
          interaction.guild,
          "👢 Kick",
          `**Użytkownik:** ${user.tag}\n` +
          `**Moderator:** ${interaction.user.tag}\n` +
          `**Powód:** ${reason}`
        );

        return interaction.reply(
          `👢 **${user.tag}** został wyrzucony.\nPowód: ${reason}`
        );
      }

      /* ====================================
         MUTE
      ==================================== */

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

        await member.timeout(
          10 * 60 * 1000,
          `Mute przez ${interaction.user.tag}`
        );

        return interaction.reply(
          `🔇 **${user.tag}** został wyciszony na 10 minut.`
        );
      }

      /* ====================================
         UNMUTE
      ==================================== */

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

        await member.timeout(null);

        return interaction.reply(
          `🔊 **${user.tag}** może już pisać.`
        );
      }

      /* ====================================
         SAY
      ==================================== */

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
          content: "✅ Wysłano.",
          ephemeral: true
        });

        return interaction.channel.send(text);
      }

      /* ====================================
         SERVERINFO
      ==================================== */

      if (
        interaction.commandName === "serverinfo"
      ) {

        const guild = interaction.guild;

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle(`📊 ${guild.name}`)
          .setThumbnail(
            guild.iconURL()
          )
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

    /* ======================================
       PRZYCISKI
    ====================================== */

    if (interaction.isButton()) {

      /* ====================================
         START WERYFIKACJI
      ==================================== */

      if (interaction.customId === "verify") {

        if (
          !isConfigured(
            config.VERIFIED_ROLE_ID
          )
        ) {

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

        const modal =
          new ModalBuilder()
            .setCustomId(
              "verification_nick"
            )
            .setTitle(
              "⛏️ Weryfikacja Minecraft"
            );

        const nickInput =
          new TextInputBuilder()
            .setCustomId(
              "minecraft_nick"
            )
            .setLabel(
              "Twój nick z Minecrafta"
            )
            .setPlaceholder(
              "Np. Steve123"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setMinLength(1)
            .setMaxLength(16)
            .setRequired(true);

        const row =
          new ActionRowBuilder()
            .addComponents(
              nickInput
            );

        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      /* ====================================
         PODANIE ODPOWIEDZI MATEMATYCZNEJ
      ==================================== */

      if (
        interaction.customId ===
        "verification_answer"
      ) {

        const data =
          verificationData.get(
            interaction.user.id
          );

        if (!data) {

          return interaction.reply({
            content:
              "❌ Twoja weryfikacja wygasła. Rozpocznij ją ponownie.",
            ephemeral: true
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "verification_math"
            )
            .setTitle(
              "🧮 Odpowiedź matematyczna"
            );

        const answerInput =
          new TextInputBuilder()
            .setCustomId(
              "math_answer"
            )
            .setLabel(
              "Wynik działania"
            )
            .setPlaceholder(
              "Np. 25"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(10);

        const row =
          new ActionRowBuilder()
            .addComponents(
              answerInput
            );

        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      /* ====================================
         OTWARCIE WYBORU KATEGORII
      ==================================== */

      if (
        interaction.customId === "create_ticket"
      ) {

        const existing =
          interaction.guild.channels.cache.find(
            channel =>
              channel.type === ChannelType.GuildText &&
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

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("🎫 WYBIERZ KATEGORIĘ")
          .setDescription(
            "Wybierz poniżej kategorię, która najlepiej opisuje Twoją sprawę.\n\n" +

            "🆘 **Pomoc z wejściem**\n" +
            "Problemy z wejściem na serwer.\n\n\n" +

            "🚨 **Zgłoszenie gracza**\n" +
            "Zgłoszenie osoby łamiącej zasady.\n\n\n" +

            "🎥 **Media & Twórca**\n" +
            "Sprawy związane z rangą Media / Twórca.\n\n\n" +

            "🤝 **Współpraca**\n" +
            "Propozycje współpracy.\n\n\n" +

            "🐛 **Znalazłem błąd**\n" +
            "Zgłoś znaleziony błąd.\n\n\n" +

            "⚖️ **Odwołanie od bana**\n" +
            "Odwołanie od nałożonej kary.\n\n\n" +

            "❓ **Inne**\n" +
            "Pozostałe sprawy."
          )
          .setFooter({
            text:
              `${interaction.guild.name} • Wybór kategorii`
          })
          .setTimestamp();

        const row1 =
          new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId("ticket_help")
              .setLabel("Pomoc z wejściem")
              .setEmoji("🆘")
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId("ticket_report")
              .setLabel("Zgłoszenie gracza")
              .setEmoji("🚨")
              .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
              .setCustomId("ticket_media")
              .setLabel("Media & Twórca")
              .setEmoji("🎥")
              .setStyle(ButtonStyle.Success)

          );

        const row2 =
          new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId("ticket_partner")
              .setLabel("Współpraca")
              .setEmoji("🤝")
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId("ticket_bug")
              .setLabel("Znalazłem błąd")
              .setEmoji("🐛")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("ticket_ban")
              .setLabel("Odwołanie od bana")
              .setEmoji("⚖️")
              .setStyle(ButtonStyle.Danger)

          );

        const row3 =
          new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId("ticket_other")
              .setLabel("Inne")
              .setEmoji("❓")
              .setStyle(ButtonStyle.Secondary)

          );

        return interaction.reply({
          embeds: [embed],
          components: [
            row1,
            row2,
            row3
          ],
          ephemeral: true
        });
      }

      /* ====================================
         PRZEJĘCIE TICKETA
      ==================================== */

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
              "❌ Nie masz uprawnień do przejęcia ticketu.",
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor(config.EMBED_COLOR)
          .setTitle("📋 TICKET PRZEJĘTY")
          .setDescription(
            `Ticket został przejęty przez **${interaction.user.tag}**.\n\n` +
            "🛡️ Ta osoba zajmie się Twoją sprawą."
          )
          .setTimestamp();

        await interaction.channel.send({
          embeds: [embed]
        });

        await sendLog(
          interaction.guild,
          "📋 Ticket przejęty",
          `**Ticket:** ${interaction.channel.name}\n` +
          `**Przejął:** ${interaction.user.tag}`
        );

        return interaction.reply({
          content:
            "✅ Pomyślnie przejąłeś ticket.",
          ephemeral: true
        });
      }

      /* ====================================
         ZAMKNIĘCIE TICKETA
      ==================================== */

      if (
        interaction.customId === "close_ticket"
      ) {

        await sendLog(
          interaction.guild,
          "🔒 Ticket zamknięty",
          `**Ticket:** ${interaction.channel.name}\n` +
          `**Zamknął:** ${interaction.user.tag}`
        );

        await interaction.reply(
          "🔒 Ticket zostanie usunięty za **3 sekundy**."
        );

        setTimeout(() => {

          interaction.channel
            .delete()
            .catch(() => {});

        }, 3000);

        return;
      }

      /* ====================================
         WYBÓR KATEGORII
      ==================================== */

      const ticketTypes = {

        ticket_help: {
          name: "Pomoc z wejściem na serwer",
          emoji: "🆘"
        },

        ticket_report: {
          name: "Zgłoszenie gracza",
          emoji: "🚨"
        },

        ticket_media: {
          name: "Media & Twórca",
          emoji: "🎥"
        },

        ticket_partner: {
          name: "Współpraca",
          emoji: "🤝"
        },

        ticket_bug: {
          name: "Znalazłem błąd",
          emoji: "🐛"
        },

        ticket_ban: {
          name: "Odwołanie od bana",
          emoji: "⚖️"
        },

        ticket_other: {
          name: "Inne",
          emoji: "❓"
        }

      };

      if (
        ticketTypes[interaction.customId]
      ) {

        const existing =
          interaction.guild.channels.cache.find(
            channel =>
              channel.type === ChannelType.GuildText &&
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

        const category =
          ticketTypes[interaction.customId];

        const modal =
          new ModalBuilder()
            .setCustomId(
              `ticket_modal_${interaction.customId}`
            )
            .setTitle(category.name);

        const nickInput =
          new TextInputBuilder()
            .setCustomId("ticket_nick")
            .setLabel("Twój nick")
            .setPlaceholder(
              "Wpisz swój nick"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(100);

        const problemInput =
          new TextInputBuilder()
            .setCustomId("ticket_problem")
            .setLabel("Opisz swoją sprawę")
            .setPlaceholder(
              "Dokładnie opisz swój problem..."
            )
            .setStyle(
              TextInputStyle.Paragraph
            )
            .setRequired(true)
            .setMaxLength(1000);

        const screenInput =
          new TextInputBuilder()
            .setCustomId("ticket_screen")
            .setLabel(
              "Screen / dodatkowe informacje"
            )
            .setPlaceholder(
              "Wklej link do screena lub wpisz brak"
            )
            .setStyle(
              TextInputStyle.Paragraph
            )
            .setRequired(false)
            .setMaxLength(1000);

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(nickInput),

          new ActionRowBuilder()
            .addComponents(problemInput),

          new ActionRowBuilder()
            .addComponents(screenInput)

        );

        return interaction.showModal(modal);
      }
    }

    /* ======================================
       FORMULARZE
    ====================================== */

    if (interaction.isModalSubmit()) {

      /* ====================================
         WERYFIKACJA - NICK MINECRAFT
      ==================================== */

      if (
        interaction.customId ===
        "verification_nick"
      ) {

        const nick =
          interaction.fields
            .getTextInputValue(
              "minecraft_nick"
            )
            .trim();

        if (
          !/^[a-zA-Z0-9_]+$/.test(nick)
        ) {

          return interaction.reply({
            content:
              "❌ Nick Minecraft może zawierać tylko litery, cyfry oraz znak `_`.",
            ephemeral: true
          });
        }

        const math =
          generateMathQuestion();

        verificationData.set(
          interaction.user.id,
          {
            nick: nick,
            answer: math.answer
          }
        );

        const embed =
          new EmbedBuilder()
            .setColor(config.EMBED_COLOR)
            .setTitle(
              "🧮 WERYFIKACJA — KROK 2/2"
            )
            .setDescription(
              `🎮 **Nick Minecraft:** \`${nick}\`\n\n` +

              "Teraz rozwiąż poniższe działanie:\n\n" +

              `# **${math.question} = ?**\n\n` +

              "Kliknij przycisk **Podaj odpowiedź** i wpisz wynik."
            )
            .setFooter({
              text:
                "Weryfikacja serwera Minecraft"
            })
            .setTimestamp();

        const row =
          new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId(
                "verification_answer"
              )
              .setLabel("Podaj odpowiedź")
              .setEmoji("🧮")
              .setStyle(
                ButtonStyle.Primary
              )

          );

        return interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true
        });
      }

      /* ====================================
         WERYFIKACJA - MATEMATYKA
      ==================================== */

      if (
        interaction.customId ===
        "verification_math"
      ) {

        const data =
          verificationData.get(
            interaction.user.id
          );

        if (!data) {

          return interaction.reply({
            content:
              "❌ Twoja weryfikacja wygasła. Rozpocznij ją ponownie.",
            ephemeral: true
          });
        }

        const answerText =
          interaction.fields
            .getTextInputValue(
              "math_answer"
            )
            .trim();

        const answer =
          Number(answerText);

        if (
          !Number.isFinite(answer) ||
          answer !== data.answer
        ) {

          verificationData.delete(
            interaction.user.id
          );

          return interaction.reply({
            content:
              "❌ **Niepoprawna odpowiedź!**\n\n" +
              "Musisz rozpocząć weryfikację ponownie.",
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
              "❌ Nie znaleziono roli Zweryfikowany.",
            ephemeral: true
          });
        }

        /* USTAWIENIE NICKU */

        try {

          await interaction.member.setNickname(
            data.nick
          );

        } catch (error) {

          console.error(
            "Nie udało się ustawić nicku:",
            error
          );
        }

        /* NADANIE ROLI */

        try {

          await interaction.member.roles.add(
            role
          );

        } catch (error) {

          console.error(
            "Nie udało się nadać roli:",
            error
          );

          return interaction.reply({
            content:
              "❌ Nie udało się nadać rangi. Sprawdź, czy rola bota jest wyżej niż rola Zweryfikowany.",
            ephemeral: true
          });
        }

        verificationData.delete(
          interaction.user.id
        );

        const embed =
          new EmbedBuilder()
            .setColor(config.EMBED_COLOR)
            .setTitle(
              "🎉 WERYFIKACJA ZAKOŃCZONA!"
            )
            .setDescription(
              `**Gratulacje!** 🎉\n\n` +

              `🎮 **Nick Minecraft:** \`${data.nick}\`\n\n` +

              "✅ Otrzymałeś rangę **Zweryfikowany**.\n" +
              "🏷️ Twój pseudonim na Discordzie został ustawiony.\n\n" +

              "**Witamy na serwerze! ⛏️**"
            )
            .setFooter({
              text:
                `${interaction.guild.name} • Weryfikacja`
            })
            .setTimestamp();

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      /* ====================================
         FORMULARZ TICKETA
      ==================================== */

      if (
        !interaction.customId.startsWith(
          "ticket_modal_"
        )
      ) {
        return;
      }

      const type =
        interaction.customId.replace(
          "ticket_modal_",
          ""
        );

      const ticketTypes = {

        ticket_help: {
          name: "Pomoc z wejściem na serwer",
          emoji: "🆘"
        },

        ticket_report: {
          name: "Zgłoszenie gracza",
          emoji: "🚨"
        },

        ticket_media: {
          name: "Media & Twórca",
          emoji: "🎥"
        },

        ticket_partner: {
          name: "Współpraca",
          emoji: "🤝"
        },

        ticket_bug: {
          name: "Znalazłem błąd",
          emoji: "🐛"
        },

        ticket_ban: {
          name: "Odwołanie od bana",
          emoji: "⚖️"
        },

        ticket_other: {
          name: "Inne",
          emoji: "❓"
        }

      };

      const category =
        ticketTypes[type];

      if (!category) {

        return interaction.reply({
          content:
            "❌ Nieprawidłowa kategoria.",
          ephemeral: true
        });
      }

      const existing =
        interaction.guild.channels.cache.find(
          channel =>
            channel.type === ChannelType.GuildText &&
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

      /* ====================================
         UPRAWNIENIA DO TICKETA
      ==================================== */

      const overwrites = [

        {
          id:
            interaction.guild.roles.everyone.id,

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

        overwrites.push({

          id: roleId,

          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]

        });
      }

      /* ====================================
         TWORZENIE KANAŁU
      ==================================== */

      const channel =
        await interaction.guild.channels.create({

          name:
            `ticket-${interaction.user.id}`,

          type:
            ChannelType.GuildText,

          parent:
            config.TICKET_CATEGORY_ID,

          permissionOverwrites:
            overwrites

        });

      /* ====================================
         EMBED TICKETA
      ==================================== */

      const embed =
        new EmbedBuilder()
          .setColor(config.EMBED_COLOR)

          .setTitle(
            `${category.emoji} ${category.name}`
          )

          .setDescription(
            "### 🎫 Nowy ticket\n\n" +

            "Dziękujemy za kontakt z administracją!\n" +
            "Poniżej znajdują się informacje podane w formularzu.\n\n" +

            "━━━━━━━━━━━━━━━━━━━━\n\n" +

            `👤 **Nick:**\n${nick}\n\n` +

            `📝 **Opis sprawy:**\n${problem}\n\n` +

            `📸 **Screen / dodatkowe informacje:**\n${screen}\n\n` +

            "━━━━━━━━━━━━━━━━━━━━\n\n" +

            "🛡️ Administracja zajmie się Twoją sprawą.\n\n" +

            "📋 **Przejmij ticket** — osoba z odpowiednią rangą może przejąć sprawę.\n\n" +

            "🔒 **Zamknij ticket** — użyj po zakończeniu sprawy."
          )

          .setFooter({
            text:
              `${interaction.guild.name} • System ticketów`
          })

          .setTimestamp();

      /* ====================================
         PRZYCISKI TICKETA
      ==================================== */

      const row =
        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("claim_ticket")
            .setLabel("Przejmij ticket")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("close_ticket")
            .setLabel("Zamknij ticket")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)

        );

      await channel.send({

        content:
          `${interaction.user}`,

        embeds: [
          embed
        ],

        components: [
          row
        ]

      });

      /* ====================================
         LOG UTWORZENIA
      ==================================== */

      await sendLog(

        interaction.guild,

        "🎫 Ticket utworzony",

        `**Użytkownik:** ${interaction.user.tag}\n` +
        `**Kategoria:** ${category.name}\n` +
        `**Kanał:** ${channel}`

      );

      return interaction.reply({

        content:
          `✅ Ticket został utworzony: ${channel}`,

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

/* ========================================
   LOGOWANIE BOTA
======================================== */

if (!process.env.DISCORD_TOKEN) {

  console.error(
    "❌ Brak DISCORD_TOKEN. Ustaw zmienną środowiskową DISCORD_TOKEN."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
