'use strict';

const authentication = require('./authentication');
const hydrators = require('./hydrators');
const { befores = [], afters = [] } = require('./middleware');
const sendFax = require('./creates/send_fax');
const findFax = require('./searches/find_fax');
const newInboundFax = require('./triggers/new_inbound_fax');
const faxDelivered = require('./triggers/fax_delivered');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  authentication,
  hydrators,

  // The performs trim and drop empty values themselves, so the platform's cleaning is off and the
  // input reaches the code as the person typed it.
  flags: { cleanInputData: false },

  beforeRequest: [...befores],
  afterResponse: [...afters],

  triggers: {
    [newInboundFax.key]: newInboundFax,
    [faxDelivered.key]: faxDelivered,
  },
  searches: {
    [findFax.key]: findFax,
  },
  creates: {
    [sendFax.key]: sendFax,
  },
  resources: {},
};
