import { utils } from '@ohif/core';

import getBulkdataValue from './getBulkdataValue';
import createRenderedRetrieve from './createRenderedRetrieve';

/**
 * Generates a URL that can be used for direct retrieve of the bulkdata
 *
 * @param {object} params
 * @param {string} params.tag is the tag name of the URL to retrieve
 * @param {string} params.defaultPath path for the pixel data url
 * @param {object} params.instance is the instance object that the tag is in
 * @param {string} params.defaultType is the mime type of the response
 * @param {string} params.singlepart is the type of the part to retrieve
 * @param {string} params.fetchPart unknown?
 * @param {string} params.url unknown?
 * @returns an absolute URL to the resource, if the absolute URL can be retrieved as singlepart,
 *    or is already retrieved, or a promise to a URL for such use if a BulkDataURI
 */
const getDirectURL = (config, params) => {
  console.log('getDirectURL - Function called with params:', params);
  console.log('getDirectURL - Config:', config);

  const { singlepart } = config;
  const {
    instance,
    tag = 'PixelData',
    defaultType = 'video/mp4',
    singlepart: fetchPart = 'video',
    url = null,
  } = params;

  console.log('getDirectURL - Processing instance:', instance);
  console.log('getDirectURL - Tag to retrieve:', tag);
  console.log('getDirectURL - Default MIME type:', defaultType);
  console.log('getDirectURL - Single part fetch type:', fetchPart);

  if (url) {
    console.log('getDirectURL - Direct URL provided:', url);
    return url;
  }

  const value = instance[tag];
  console.log('getDirectURL - Retrieved value for tag:', value);

  if (value) {
    if (value.DirectRetrieveURL) {
      console.log('getDirectURL - Using existing DirectRetrieveURL:', value.DirectRetrieveURL);
      return value.DirectRetrieveURL;
    }

    if (value.InlineBinary) {
      console.log('getDirectURL - Found InlineBinary data, converting to blob');
      const blob = utils.b64toBlob(value.InlineBinary, defaultType);
      value.DirectRetrieveURL = URL.createObjectURL(blob);
      console.log('getDirectURL - Created URL from InlineBinary:', value.DirectRetrieveURL);
      return value.DirectRetrieveURL;
    }

    if (!singlepart || (singlepart !== true && singlepart.indexOf(fetchPart) === -1)) {
      if (value.retrieveBulkData) {
        // Try the specified retrieve type.
        console.log('getDirectURL - Attempting to retrieve bulk data with options:', {
          mediaType: defaultType,
        });
        const options = {
          mediaType: defaultType,
        };
        return value
          .retrieveBulkData(options)
          .then(arr => {
            value.DirectRetrieveURL = URL.createObjectURL(new Blob([arr], { type: defaultType }));
            console.log(
              'getDirectURL - Created URL from retrieved bulk data:',
              value.DirectRetrieveURL
            );
            return value.DirectRetrieveURL;
          })
          .catch(error => {
            console.error('getDirectURL - Error retrieving bulk data:', error);
            return undefined;
          });
      }
      console.warn('getDirectURL - Unable to retrieve', tag, 'from', instance);
      return undefined;
    }
  } else {
    console.warn('getDirectURL - Value not found for tag:', tag);
  }

  console.log('getDirectURL - Falling back to rendered retrieve or bulkdata value');
  const result = createRenderedRetrieve(config, params) || getBulkdataValue(config, params);
  console.log('getDirectURL - Final result:', result);
  return result;
};

export default getDirectURL;
