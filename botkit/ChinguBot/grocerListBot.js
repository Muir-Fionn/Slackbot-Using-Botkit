/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
This is a simple Slack bot built with Botkit.
Expanded from the slack_bot.js example from the Botkit repository.

This bot helps to manage grocery list items for Slack users:

* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node grocerListBot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "Hello"

  The bot will reply "Hello!"

  Say: "who are you?"

  The bot will tell you its name, where it is running, and for how long.

  Say: "Call me <nickname>"

  Tell the bot your nickname. Now you are friends.

  Say: "who am I?"

  The bot will tell you your nickname, if it knows one for you.

  Say: "shutdown"

  The bot will ask if you are sure, and then shut itself down.

# USE THE LIST:

  Say: "add <item>"

  The bot will add the item to your list and give you back your updated list.

  Say: "remove <item>"

  The bot will remove the item from your list.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('../lib/Botkit.js');
var os = require('os');

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
//add items to list
controller.hears(['add (.*)', 'include (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var item = message.match[1].split(', ');
    controller.storage.users.get(message.user, function(err, user) {
      var repeats = [];
        if (!user) {
            user = {
                id: message.user,
            };
        }
        if(!user.list){
          user.list = item;
        }else {
          var itemsAdded = [];
          item.forEach(function(el, i) {
            //Check if item is already on the list
            if(user.list.indexOf(el) < 0){
              user.list.push(el);
              itemsAdded.push(el);
            }else {
              repeats.push(el)
            }
          })
          item = itemsAdded;
        }
        var itemsString = item.length > 0 ? 'I have added ' + item.join(', ') + ' to your list.' : ''
        var repeatString = repeats.length > 0 ? 'Your list already includes: ' + repeats.join(', ') + '.' : '';
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. ' + itemsString + repeatString + '\nYour list is: ' + user.list.join(', ') + '.');
        });
    });
});

//remove items from list
controller.hears(['remove (.*)', 'erase (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var item = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        if(!user.list){
          controller.storage.users.save(user, function(err, id) {
              bot.reply(message, 'There are no items to remove. Your list is empty.');
            });
        }else {
          for(var i = 0; i < user.list.length; i++)
          {
            if(item == user.list[i]){
              user.list.splice(i, 1);
            }
          }
          controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I have removed ' + item + ' from your list.\nYour list is: ' + user.list.join(', ') + '.');
          });
        }
    });
});

//clear all items from list
controller.hears(['empty list', 'remove list', 'delete list'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }

        user.list = [];

        controller.storage.users.save(user, function(err, id) {
          bot.reply(message, 'Got it. Your list is' + (user.list.length > 0 ? ': ' + user.list.join(', ') : ' empty') + '.');
        });
    });
});

//print list
controller.hears(['print list', 'my list'], 'direct_message,direct_mention,mention', function(bot, message) {
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }

        if(!user.list || user.list.lengh > 0){
          controller.storage.users.save(user, function(err, id) {
              bot.reply(message, 'There are no items to remove. Your list is empty.');
            });
        }else {
          controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Your list is: ' + user.list.join(', ')  + '.');
          });
        }
    });
});
