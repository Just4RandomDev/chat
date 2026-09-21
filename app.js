{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid",
        "username": { ".validate": "newData.isString() && newData.val().length >= 2 && newData.val().length <= 24" },
        "bio":      { ".validate": "newData.isString() && newData.val().length <= 200" },
        "pfp":      { ".validate": "newData.isString() && newData.val().length <= 600000" },
        "$other":   { ".validate": false }
      }
    },
    "blocks": {
      "$uid": {
        ".read":  "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "notifications": {
      "$uid": {
        ".read":  "auth != null && auth.uid === $uid",
        ".write": "auth != null",
        "$notifId": {
          ".write": "auth != null && (!data.exists() || auth.uid === $uid)",
          "read":      { ".validate": "newData.isBoolean()" },
          "type":      { ".validate": "newData.val() === 'mention' || newData.val() === 'dm' || newData.val() === 'reply'" },
          "title":     { ".validate": "newData.isString() && newData.val().length <= 200" },
          "body":      { ".validate": "newData.isString() && newData.val().length <= 500" },
          "fromUid":   { ".validate": "newData.isString()" },
          "roomCode":  { ".validate": "newData.isString() || newData.val() === null" },
          "timestamp": { ".validate": "newData.isNumber()" }
        }
      }
    },
    "rooms": {
      ".read": "auth != null",
      "$code": {
        ".write": "auth != null && (!data.exists() || data.child('adminUid').val() === auth.uid || $code === 'public' || data.child('adminUid').val() === 'system')",
        ".validate": "newData.hasChildren(['name', 'adminUid'])",
        "name":         { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
        "adminUid":     { ".validate": "newData.val() === auth.uid || $code === 'public' || data.exists()" },
        "hasPassword":  { ".validate": "newData.isBoolean()" },
        "passwordHash": { ".validate": "newData.isString() && newData.val().length <= 128" },
        "maxUsers":     { ".validate": "newData.isNumber() && newData.val() >= 2 && newData.val() <= 500" },
        "isPublic":     { ".validate": "newData.isBoolean()" },
        "createdAt":    { ".validate": "newData.isNumber()" },
        "lastActivity": { ".validate": "newData.isNumber()" },
        "kicked": { "$kickedUid": { ".validate": "newData.isBoolean()" } }
      }
    },
    "chats": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null",
        "presence": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid",
            ".validate": "newData.hasChildren(['username', 'joinedAt'])"
          }
        },
        "messages": {
          ".indexOn": ["timestamp"],
          "$messageId": {
            ".write": "auth != null && (!data.exists() || data.child('uid').val() === auth.uid || root.child('rooms').child($code).child('adminUid').val() === auth.uid)",
            ".validate": "newData.hasChildren(['uid', 'timestamp'])",
            "uid":       { ".validate": "newData.val() === auth.uid" },
            "text":      { ".validate": "newData.isString() && newData.val().length < 20000" },
            "mediaType": { ".validate": "newData.val() === null || newData.val() === 'image' || newData.val() === 'gif' || newData.val() === 'video'" },
            "mediaData": { ".validate": "newData.val() === null || (newData.isString() && newData.val().length < 3000000)" },
            "replyTo":   { ".validate": "newData.val() === null || (newData.hasChildren(['uid', 'username']))" },
            "timestamp": { ".validate": "newData.isNumber()" },
            "$other":    { ".validate": false }
          }
        }
      }
    },
    "dms": {
      "$pairKey": {
        ".read":  "auth != null && ($pairKey.beginsWith(auth.uid + '__') || $pairKey.endsWith('__' + auth.uid))",
        ".write": "auth != null && ($pairKey.beginsWith(auth.uid + '__') || $pairKey.endsWith('__' + auth.uid))"
      }
    }
  }
}
