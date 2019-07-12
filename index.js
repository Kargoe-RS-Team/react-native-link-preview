/**
* @providesModule react-native-link-preview
*/

const cheerio = require('cheerio-without-node-native');
const urlObj = require('url');
const fetch = require('cross-fetch').fetch;
require('es6-promise').polyfill();

import RNFetchBlob from 'react-native-fetch-blob'

const CONSTANTS = require('./constants');

const Fetch = RNFetchBlob.polyfill.Fetch;
// replace built-in fetch
const fetchReplacement = new Fetch({
    // enable this option so that the response data conversion handled automatically
    auto : true,
    // when receiving response data, the module will match its Content-Type header
    // with strings in this array. If it contains any one of string in this array, 
    // the response body will be considered as binary data and the data will be stored
    // in file system instead of in memory.
    // By default, it only store response data to file system when Content-Type 
    // contains string `application/octet`.
    binaryContentTypes : [
        'image/',
        'video/',
        'audio/',
        'foo/',
    ]
}).build();

exports.getPreview = function (text, options) {

   // RNFetchBlob.fetch('GET', urlLink)

  return new Promise(function (resolve, reject) {
    if (!text) {
      reject({
        error: 'React-Native-Link-Preview did not receive either a url or text'
      });
    }

    var detectedUrl = null;

    text.replace(/\n/g, ' ').split(' ').forEach(function (token) {
      if (CONSTANTS.REGEX_VALID_URL.test(token) && !detectedUrl) {
        detectedUrl = token;
      }
    });

    if (detectedUrl) {
      console.log("ready to fetch " + detectedUrl)
      //RNFetchBlob.fetch('GET', detectedUrl)
      fetchReplacement(detectedUrl)
        .then(function (response) {

          console.log("response keys in link preview = " + JSON.stringify(Object.keys(response)))
       
          var keys = Object.keys(response)  
          for (var i = 0; i < keys.length; i++) {
            console.log("key = " + keys[i] + " : " + response[keys[i]]) 
          } 
          // get final URL (after any redirects)
          const finalUrl = response.url ? response.url : detectedUrl;

          // get content type of response
         
          var contentType = null

          if (response.headers) {
            console.log("response.headers = " + JSON.stringify(response.headers))

            if (response.headers.get)
              contentType = response.headers.get('content-type');
            else 
              contentType = response.headers['content-type']
          }
          console.log("contentType loc 1 = " + contentType)

          // this is not mime type this is like utf8 i think
          // if (!contentType && response.type) contentType = response.type

          if (!contentType) {
            return reject({ error: 'React-Native-Link-Preview: Could not extract content type for URL.' });
          }
          if (contentType instanceof Array) {
            contentType = contentType[0];
          }

          console.log('ready to parse response type = ' + JSON.stringify(contentType))

          // parse response depending on content type
          if (contentType && CONSTANTS.REGEX_CONTENT_TYPE_IMAGE.test(contentType)) {
            console.log("parse image")
            resolve(parseImageResponse(finalUrl, contentType));
          } else if (contentType && CONSTANTS.REGEX_CONTENT_TYPE_AUDIO.test(contentType)) {
            resolve(parseAudioResponse(finalUrl, contentType));
          } else if (contentType && CONSTANTS.REGEX_CONTENT_TYPE_VIDEO.test(contentType)) {
            console.log("parse video")
            resolve(parseVideoResponse(finalUrl, contentType));
          } else if (contentType && CONSTANTS.REGEX_CONTENT_TYPE_TEXT.test(contentType)) {
            console.log("parse text")
            response.text()
              .then(function (text) {
                console.log("parse resolve text")
                resolve(parseTextResponse(text, finalUrl, options || {}, contentType));
                
              });
          } else if (contentType && CONSTANTS.REGEX_CONTENT_TYPE_APPLICATION.test(contentType)) {
            console.log("final parse")
            resolve(parseApplicationResponse(finalUrl, contentType));
          } else {
            console.log("unknown content type for url")
            reject({ error: 'React-Native-Link-Preview: Unknown content type for URL.' });
          }
        })
        .catch(function (error) { console.log("ready to reject error = " + JSON.stringify(error)); reject({ error: error }) });
    } else {
      console.log("reject 2")
      reject({
        error: 'React-Native-Link-Preview did not find a link in the text'
      });
    }
  });
};

// recursively search through object to find property with given id
// returns value if found, undefined if not found
const findById = function (object, key) {
  var value;

  Object.keys(object).some(function(k) {
    if (k.toLowerCase() === key) {
      value = object[k];
      return true;
    }
    if (object[k] && typeof object[k] === 'object') {
      value = findById(object[k], key);
      return value !== undefined;
    }
    return false;
  });
  return value;
};

const parseImageResponse = function (url, contentType) {
  return {
    url: url,
    mediaType: 'image',
    contentType: contentType,
    favicons: [getDefaultFavicon(url)]
  };
};

const parseAudioResponse = function (url, contentType) {
  return {
    url: url,
    mediaType: 'audio',
    contentType: contentType,
    favicons: [getDefaultFavicon(url)]
  };
};

const parseVideoResponse = function (url, contentType) {
  return {
    url: url,
    mediaType: 'video',
    contentType: contentType,
    favicons: [getDefaultFavicon(url)]
  };
};

const parseApplicationResponse = function (url, contentType) {
  return {
    url: url,
    mediaType: 'application',
    contentType: contentType,
    favicons: [getDefaultFavicon(url)]
  };
};

const parseTextResponse = function (body, url, options, contentType) {
  const doc = cheerio.load(body);

  return {
    url: url,
    title: getTitle(doc),
    description: getDescription(doc),
    mediaType: getMediaType(doc) || 'website',
    contentType: contentType,
    images: getImages(doc, url, options.imagesPropertyType),
    videos: getVideos(doc),
    favicons: getFavicons(doc, url)
  };
};

const getTitle = function (doc) {
  var title = doc("meta[property='og:title']").attr('content');

  if (!title) {
    title = doc('title').text();
  }

  return title;
};

const getDescription = function (doc) {
  var description = doc('meta[name=description]').attr('content');

  if (description === undefined) {
    description = doc('meta[name=Description]').attr('content');
  }

  if (description === undefined) {
    description = doc("meta[property='og:description']").attr('content');
  }

  return description;
};

const getMediaType = function (doc) {
  const node = doc('meta[name=medium]');

  if (node.length) {
    const content = node.attr('content');
    return content === 'image' ? 'photo' : content;
  } else {
    return doc("meta[property='og:type']").attr('content');
  }
};

const getImages = function (doc, rootUrl, imagesPropertyType) {
  var images = [],
    nodes,
    src,
    dic;

  var imagePropertyType = imagesPropertyType || 'og'
  nodes = doc('meta[property=\'' + imagePropertyType + ':image\']');

  if (nodes.length) {
    nodes.each(function (index, node) {
      src = node.attribs.content;
      if (src) {
        src = urlObj.resolve(rootUrl, src);
        images.push(src);
      }
    });
  }

  if (images.length <= 0 && !imagesPropertyType) {
    src = doc('link[rel=image_src]').attr('href');
    if (src) {
      src = urlObj.resolve(rootUrl, src);
      images = [src];
    } else {
      nodes = doc('img');

      if (nodes.length) {
        dic = {};
        images = [];
        nodes.each(function (index, node) {
          src = node.attribs.src;
          if (src && !dic[src]) {
            dic[src] = 1;
            // width = node.attribs.width;
            // height = node.attribs.height;
            images.push(urlObj.resolve(rootUrl, src));
          }
        });
      }
    }
  }

  return images;
};

const getVideos = function (doc) {
  const videos = [];
  var nodeTypes;
  var nodeSecureUrls;
  var nodeType;
  var nodeSecureUrl;
  var video;
  var videoType;
  var videoSecureUrl;
  var width;
  var height;
  var videoObj;
  var index;

  const nodes = doc("meta[property='og:video']");
  const length = nodes.length;

  if (length) {
    nodeTypes = doc("meta[property='og:video:type']");
    nodeSecureUrls = doc("meta[property='og:video:secure_url']");
    width = doc("meta[property='og:video:width']").attr('content');
    height = doc("meta[property='og:video:height']").attr('content');

    for (index = 0; index < length; index++) {
      video = nodes[index].attribs.content;

      nodeType = nodeTypes[index];
      videoType = nodeType ? nodeType.attribs.content : null;

      nodeSecureUrl = nodeSecureUrls[index];
      videoSecureUrl = nodeSecureUrl ? nodeSecureUrl.attribs.content : null;

      videoObj = {
        url: video,
        secureUrl: videoSecureUrl,
        type: videoType,
        width: width,
        height: width
      };
      if (videoType && videoType.indexOf('video/') === 0) {
        videos.splice(0, 0, videoObj);
      } else {
        videos.push(videoObj);
      }
    }
  }

  return videos;
};

// returns an array of URL's to favicon images
const getFavicons = function (doc, rootUrl) {
  var images = [],
    nodes = [],
    src;

  const relSelectors = ['rel=icon', 'rel="shortcut icon"', 'rel=apple-touch-icon'];

  relSelectors.forEach(function (relSelector) {
    // look for all icon tags
    nodes = doc('link[' + relSelector + ']');

    // collect all images from icon tags
    if (nodes.length) {
      nodes.each(function (index, node) {
        src = node.attribs.href;
        if (src) {
          src = urlObj.resolve(rootUrl, src);
          images.push(src);
        }
      });
    }
  });

  // if no icon images, use default favicon location
  if (images.length <= 0) {
    images.push(getDefaultFavicon(rootUrl));
  }

  return images;
};

// returns default favicon (//hostname/favicon.ico) for a url
const getDefaultFavicon = function (rootUrl) {
  return urlObj.resolve(rootUrl, '/favicon.ico');
};
