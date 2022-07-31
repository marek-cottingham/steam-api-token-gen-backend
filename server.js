
var express = require('express');
var axios = require('axios');

var app = express();
var server = app.listen(process.env.PORT||8000);

try {
  var config = require('./config');
} catch (e) {
  var config = require('./config.template');
}
var steam_api_key = config.steam_api_key;

if (steam_api_key=="YOUR_STEAM_API_KEY"){
  throw new Error("Please set your steam api key in config.js");
}

function runAsyncWrapper (callback) {
    return function (req, res, next) {
      callback(req, res, next)
        .catch(next)
    }
  }

function throwFromAxiosErrorWithRedactedKey(error){
  error = error.toJSON();
  if (error.config.params.key != steam_api_key){
    throw new Error(error.message + ' (failed to redact api key)');
  }
  error.config.params.key = "";
  throw new Error(JSON.stringify(error));
}

async function getUserIdFromName(name) {
  if (name == null || name == '' || name == 'undefined') {
    throw new Error('Name or user id is required');
  }
  let response = await axios.get('http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/', {
    params: {
        vanityurl: name,
        key: steam_api_key,
    }
  }).catch(throwFromAxiosErrorWithRedactedKey);
  if (response.data.response.success == 1) {
    return response.data.response.steamid;
  }else{
    throw new Error('Steam user lookup failed: ' + response.data.response.message);
  }
}

async function getUserGames(userId){
  let response = await axios.get('http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/', {
    params: {
        steamid: userId,
        key: steam_api_key,
        include_appinfo: 1,
        include_played_free_games: 1,
    }
  }).catch(function(error){
    errorJSON = error.toJSON();
    if (errorJSON.status == 500){
      throw new Error('Steam user games lookup failed with status 500. User id may be invalid.');
    }else{
      throwFromAxiosErrorWithRedactedKey(error);
    }
  });
  if (response.data.response.games.length > 0) {
    return response.data.response.games;
  }
  return [];
}

async function getGameAchievements(gameId, userId){
  let response = await axios.get(
    'http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/', {
    params: {
        appid: gameId,
        steamid: userId,
        key: steam_api_key,
        l: "en"
    }
  }).catch(function(error){
    if (error.response.status == 400){
      return
    }else{
      throwFromAxiosErrorWithRedactedKey(error)
    }
  });
  try {
    if (response.data.playerstats.achievements.length > 0) {
      return response.data.playerstats.achievements;
    }
  }catch(error){
    if (error.name == 'TypeError'){
      return [];
    }
    throw error;
  }
  return [];
}

async function getGameSchemaAchievements(gameId){
  let response = await axios.get('http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/', {
    params: {
        appid: gameId,
        key: steam_api_key,
        l: "en"
    }
  }).catch(throwFromAxiosErrorWithRedactedKey);

  try {
    return response.data.game.availableGameStats.achievements;
  }catch(error){
    if (error.name == 'TypeError'){
      return [];
    }
    throw error;
  }
}

async function parseGameAchievements(game, userId){
  let achievementsParsed = [];
  let gameAchievements = await getGameAchievements(game.appid, userId);
  let gameSchemaAch = await getGameSchemaAchievements(game.appid);
  for (let j = 0; j < gameAchievements.length; j++) {
      if (gameAchievements[j].achieved == 1) {

        let achievement = {}

        if (gameAchievements[j].description == ""){
          achievement.name = (
            game.name + ": " + gameAchievements[j].name
          );
        }else{
          achievement.name = (
            game.name + ": " 
            + gameAchievements[j].name + " | " 
            + gameAchievements[j].description
          );
        }

        achievement.game = game.name;
        achievement.game_id = game.appid;
        achievement.image_url = null;

        for (let k = 0; k < gameSchemaAch.length; k++) {
          if (gameAchievements[j].apiname == gameSchemaAch[k].name) {
            achievement.image_url = gameSchemaAch[k].icon;
          }
        }

        achievementsParsed.push(achievement);
      }
  }
  return achievementsParsed;
}

app.get('/getAchievementList', runAsyncWrapper(async function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    let userName = req.query.userName;
    let userId = req.query.userId;

    if (userId == null || userId == undefined || userId == '') {
        userId = await getUserIdFromName(userName);
    }

    let games = await getUserGames(userId);
    let achievements = [];
    let achievementsPromises = [];
    let N = games.length;
    // let N = Math.min(games.length,20);
    for (let i = 0; i < N; i++) {
        if (games[i].has_community_visible_stats) {
            achievementsPromises.push(parseGameAchievements(games[i], userId));
        }
    }
    gameAchievements = await Promise.all(achievementsPromises);
    for (let i = 0; i < gameAchievements.length; i++) {
        if (gameAchievements[i] != null) {
            achievements = achievements.concat(gameAchievements[i]);
        }
    }

    res.json = {userId: userId, achievements: achievements};
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(res.json));
}))

