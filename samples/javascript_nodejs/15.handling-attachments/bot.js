// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActionTypes, ActivityTypes, CardFactory } = require('botbuilder');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

/**
 * A bot that is able to send and receive attachments. 
 */
class AttachmentsBot {
    constructor() {
    }

    /**
     * Every conversation turn for our AttachmentsBot will call this method.
     * There are no dialogs used, since it's "single turn" processing, meaning a single
     * request and response, with no stateful conversation.
     * @param turnContext A TurnContext instance containing all the data needed for processing this conversation turn.
     */
    async onTurn(turnContext) {
        if (turnContext.activity.type === ActivityTypes.Message) {
            // Determine how the bot should process the message by checking for attachments.
            if (turnContext.activity.attachments && turnContext.activity.attachments.length > 0) {
                // The user sent an attachment and the bot should handle the incoming attachment.
                await this.handleIncomingAttachment(turnContext);
            } else {
                // Since no attachment was received, send an attachment to the user.
                await this.handleOutgoingAttachment(turnContext);
            }

            // Send a HeroCard with potential options for the user to select.
            await this.displayOptions(turnContext);

        } else if (turnContext.activity.type === ActivityTypes.ConversationUpdate &&
            turnContext.activity.recipient.id !== turnContext.activity.membersAdded[0].id) {
            // If the Activity is a ConversationUpdate, send a greeting message to the user.
            await turnContext.sendActivity('Welcome to the Attachment Handling sample! Send me an attachment and I will save it.');
            await turnContext.sendActivity('Alternatively, I can send you an attachment.');

            // Send a HeroCard with potential options for the user to select.
            await this.displayOptions(turnContext);

        } else if (turnContext.activity.type !== ActivityTypes.ConversationUpdate) {
            // Respond to all other Activity types.
            await turnContext.sendActivity(`[${turnContext.activity.type}]-type activity detected.`);
        }
    }

    /**
     * Saves incoming attachments to disk by calling `this.downloadAttachmentAndWrite()` and
     * responds to the user with information about the saved attachment or an error.
     * @param {Object} turnContext 
     */
    async handleIncomingAttachment(turnContext) {
        // Prepare Promsies to download each attachment and then exceute each Promise.
        const promises = turnContext.activity.attachments.map(this.downloadAttachmentAndWrite);
        const successfulSaves = await Promise.all(promises);

        // Replies back to the user with information about where the attachment is stored on the bot's server,
        // and what the name of the saved file is.
        async function replyForReceivedAttachments(localAttachmentData) {
            if (localAttachmentData) {
                // Because the TurnContext was bound to this function, the bot can call
                // `TurnContext.sendActivity` via `this.sendActivity`;
                await this.sendActivity(`Attachment "${localAttachmentData.fileName}"` +
                    `has been received and saved to "${localAttachmentData.localPath}".`);
            } else {
                await this.sendActivity('Attachment was not successfully saved to disk.');
            }
        }

        // Prepare Promises to reply to the user with information about saved attachments.
        // The current TurnContext is bound so `replyForReceivedAttachments` can also send replies.
        const replyPromises = successfulSaves.map(replyForReceivedAttachments.bind(turnContext));
        await Promise.all(replyPromises);
    }

    /**
     * Downloads attachment to the disk.
     * @param {Object} attachment 
     */
    async downloadAttachmentAndWrite(attachment) {
        // Retrieve the attachment via the attachment's contentUrl.
        const url = attachment.contentUrl;

        // Local file path for the bot to save the attachment.
        const localFileName = path.join(__dirname, attachment.name);

        try {
            const response = await axios.get(url);
            fs.writeFile(localFileName, response.data, (fsError) => {
                if (fsError) {
                    throw fsError;
                }

            });
        }
        catch (error) {
            console.error(error);
            return undefined;
        }
        // If no error was thrown while writing to disk, return the attachment's name
        // and localFilePath for the response back to the user.
        return {
            fileName: attachment.name,
            localPath: localFileName
        }
    }

    /**
     * Responds to user with either an attachment or a default message indicating
     * an unexpected input was received.
     * @param {Object} turnContext 
     */
    async handleOutgoingAttachment(turnContext) {
        const reply = { type: ActivityTypes.Message };

        // Look at the user input, and figure out what type of attachment to send.
        // If the input matches one of the available choices, populate reply with
        // the available attachments.
        // If the choice does not match with a valid choice, inform the user of 
        // possible options.
        const firstChar = turnContext.activity.text[0];
        if (firstChar === '1') {
            reply.text = 'This is an inline attachment.';
            reply.attachments = [this.getInlineAttachment()];
        } else if (firstChar === '2') {
            reply.attachments = [this.getInternetAttachment()];
            reply.text = 'This is an internet attachment.';
        } else if (firstChar === '3') {
            reply.attachments = [await this.getUploadedAttachment(turnContext)];
            reply.text = 'This is an uploaded attachment.';
        } else {
            // The user did not enter input that this bot was built to handle.
            reply.text = 'Your input was not recognized, please try again.';
        }
        await turnContext.sendActivity(reply);
    }

    /**
     * Sends a HeroCard with choices of attachments.
     * @param {Object} turnContext 
     */
    async displayOptions(turnContext) {
        const reply = { type: ActivityTypes.Message };

        // Note that some channels require different values to be used in order to get buttons to display text.
        // In this code the emulator is accounted for with the 'title' parameter, but in other channels you may
        // need to provide a value for other parameters like 'text' or 'displayText'.
        const buttons = [
            { type: ActionTypes.ImBack, title: '1. Inline Attachment', value: '1' },
            { type: ActionTypes.ImBack, title: '2. Internet Attachment', value: '2' },
            { type: ActionTypes.ImBack, title: '3. Uploaded Attachment', value: '3' }
        ];

        const card = CardFactory.heroCard('', undefined,
            buttons, { text: 'You can upload an image or select one of the following choices.' });

        reply.attachments = [card];

        await turnContext.sendActivity(reply);
    }

    /**
     * Returns an inline attachment.
     */
    getInlineAttachment() {
        const imageData = fs.readFileSync(path.join(__dirname, '\\resources\\architecture-resize.png'));
        const base64Image = new Buffer(imageData).toString('base64');

        return {
            name: 'architecture-resize.png',
            contentType: 'image/png',
            contentUrl: `data:image/png;base64,${base64Image}`
        }
    }

    /**
     * Returns an attachment to be sent to the user from a HTTPS URL.
     */
    getInternetAttachment() {
        // NOTE: The contentUrl must be HTTPS.
        return {
            name: 'architecture-resize.png',
            contentType: 'image/png',
            contentUrl: 'https://docs.microsoft.com/en-us/bot-framework/media/how-it-works/architecture-resize.png'
        }
    }

    /**
     * Returns an attachment that has been uploaded to the channel's blob storage.
     * @param {Object} turnContext 
     */
    async getUploadedAttachment(turnContext) {
        const imageData = fs.readFileSync(path.join(__dirname, '\\resources\\architecture-resize.png'));
        const connector = turnContext.adapter.createConnectorClient(turnContext.activity.serviceUrl);
        const conversationId = turnContext.activity.conversation.id;
        const response = await connector.conversations.uploadAttachment(conversationId, {
            name: 'architecture-resize.png',
            originalBase64: imageData,
            type: 'image/png'
        });

        // Retrieve baseUri from ConnectorClient for... something.
        const baseUri = connector.baseUri;
        const attachmentUri = baseUri + (baseUri.endsWith('/') ? '' : '/') + `v3/attachments/${encodeURI(response.id)}/views/original`;
        return {
            name: 'architecture-resize.png',
            contentType: 'image/png',
            contentUrl: attachmentUri
        }
    }

    /**
     * Sends welcome messages to conversation members when they join the conversation.
     * Messages are only sent to conversation members who aren't the bot.
     * @param {Object} turnContext 
     */
    async sendWelcomeMessage(turnContext) {
        const activity = turnContext.activity;
        if (activity.membersAdded) {
            // Iterate over all new members added to the conversation.
            for (const idx in activity.membersAdded) {
                if (activity.membersAdded[idx].id !== activity.recipient.id) {
                    await turnContext.sendActivity(`Welcome to AttachmentsBot ${conversationMember.name}.` +
                    `This bot will introduce you to Attachments. Please select an option:`);
                    await this.displayOptions(turnContext);
                }
            }
        }
    }
}

exports.AttachmentsBot = AttachmentsBot;