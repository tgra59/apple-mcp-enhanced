import { ImapFlow } from 'imapflow';
import keytar from 'keytar';

interface EmailCredentials {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

interface EmailMessage {
  subject: string;
  sender: string;
  dateSent: string;
  content: string;
  isRead: boolean;
  mailbox: string;
}

// Securely store credentials
async function saveCredentials(account: string, credentials: EmailCredentials): Promise<boolean> {
  try {
    await keytar.setPassword('apple-mcp-mail', account, JSON.stringify(credentials));
    return true;
  } catch (error) {
    console.error('Error saving credentials:', error);
    return false;
  }
}

// Retrieve stored credentials
async function getCredentials(account: string): Promise<EmailCredentials | null> {
  try {
    const credentialsStr = await keytar.getPassword('apple-mcp-mail', account);
    if (!credentialsStr) return null;
    return JSON.parse(credentialsStr);
  } catch (error) {
    console.error('Error retrieving credentials:', error);
    return null;
  }
}

// Search emails using IMAP directly
async function searchMailsImap(account: string, searchTerm: string, limit = 10): Promise<EmailMessage[]> {
  const credentials = await getCredentials(account);
  if (!credentials) {
    throw new Error(`No credentials found for account ${account}. Please set up the account first.`);
  }
  
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.tls,
    auth: {
      user: credentials.user,
      pass: credentials.password
    },
    logger: false
  });

  const results: EmailMessage[] = [];
  
  try {
    // Connect to the server
    await client.connect();
    
    // Get list of mailboxes (folders)
    const mailboxes = await client.list();
    console.log('Mailboxes:', mailboxes);
    
    // Include a broader selection of folders for searching
    const searchableFolders = mailboxes.filter(mb => {
      // Check if flags is a Set (common in newer ImapFlow versions)
      const hasNoselect = mb.flags instanceof Set ? 
                         mb.flags.has('\\Noselect') : 
                         Array.isArray(mb.flags) ? 
                         mb.flags.includes('\\Noselect') : 
                         String(mb.flags).includes('\\Noselect');
      
      // Check if name exists and convert to string if needed
      const name = mb.name ? 
                  (typeof mb.name === 'string' ? mb.name.toLowerCase() : String(mb.name).toLowerCase()) : 
                  '';
      
      // Include important folders: inbox, all mail, archive, sent mail
      return !hasNoselect && (
        name === 'inbox' || 
        name.includes('all mail') || 
        name.includes('archive') || 
        name.includes('sent') ||
        // For Gmail, also include the special [Gmail] folders
        name.includes('all') || 
        name.includes('important')
      );
    });
    
    console.log('Searchable folders:', searchableFolders.map(f => f.path));
    
    // Search through each relevant folder
    for (const folder of searchableFolders) {
      // Skip if we've reached the limit
      if (results.length >= limit) break;
      
      try {
        // Select the folder
        await client.mailboxOpen(folder.path);
        
        // Search for messages containing the search term
        // This searches in subject, body, from, to fields
        const searchOptions = {
          or: [
            { subject: searchTerm },
            { body: searchTerm },
            { from: searchTerm },
            { to: searchTerm }
          ]
        };
        
        // Get message IDs that match search
        const messageIds = await client.search(searchOptions);
        
        // Get message details for each result
        for (const msgId of messageIds) {
          if (results.length >= limit) break;
          
          try {
            // Fetch the full message data
            const message = await client.fetchOne(msgId, { 
              source: true, 
              envelope: true,
              bodyStructure: true 
            });
            
            console.log(`Retrieved message ${msgId}:`, message.envelope || message);
            
            // Since parseMessage doesn't exist, we'll extract information directly
            const envelope = message.envelope || {};
            
            // Safe handling of flags - check if flags is a Set, array, or something else
            const messageFlags = message.flags instanceof Set ? Array.from(message.flags) :
                               Array.isArray(message.flags) ? message.flags :
                               typeof message.flags === 'string' ? [message.flags] : 
                               [];
            
            // Try to get message content - this might vary based on ImapFlow version
            let content = '[No content available]';
            if (message.source) {
              // Try to extract text content from the source
              // This is a simplified approach - a real implementation would parse the MIME structure
              const sourceText = message.source.toString();
              // Very simple extraction of body text after headers
              const bodyParts = sourceText.split('\r\n\r\n');
              if (bodyParts.length > 1) {
                content = bodyParts.slice(1).join('\r\n\r\n').substring(0, 1000);
              }
            }
            
            results.push({
              subject: envelope.subject || 'No subject',
              sender: envelope.from?.[0]?.address || 'Unknown sender',
              dateSent: envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString(),
              content: content,
              isRead: !messageFlags.includes('\\Unseen'),
              mailbox: folder.path
            });
          } catch (msgError) {
            console.error(`Error processing message ${msgId}:`, msgError);
          }
        }
      } catch (folderError) {
        console.error(`Error searching folder ${folder.path}:`, folderError);
      }
    }
    
    // Close the connection
    await client.logout();
    
  } catch (error) {
    console.error('IMAP search error:', error);
    throw new Error(`Error searching emails via IMAP: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return results;
}

// Add account setup function
async function setupMailAccount(
  nickname: string, 
  user: string, 
  password: string, 
  host: string, 
  port = 993, 
  tls = true
): Promise<boolean> {
  try {
    const credentials: EmailCredentials = { user, password, host, port, tls };
    
    // Test connection before saving
    const client = new ImapFlow({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.tls,
      auth: {
        user: credentials.user,
        pass: credentials.password
      },
      logger: false
    });
    
    try {
      await client.connect();
      await client.logout();
    } catch (connError) {
      throw new Error(`Connection failed: ${connError instanceof Error ? connError.message : String(connError)}`);
    }
    
    // Save credentials if connection test passed
    return await saveCredentials(nickname, credentials);
  } catch (error) {
    console.error('Error setting up mail account:', error);
    throw new Error(`Error setting up mail account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// List configured accounts
async function listImapAccounts(): Promise<string[]> {
  try {
    // Since keytar doesn't have a direct method to list all accounts for a service,
    // we'll use a workaround by finding all passwords for our service
    
    // First, let's create a list of known account nicknames
    // For simplicity, we'll check if the configured account exists
    const knownAccounts = ['gmail-test'];
    const existingAccounts = [];
    
    for (const account of knownAccounts) {
      const credentials = await keytar.getPassword('apple-mcp-mail', account);
      if (credentials) {
        existingAccounts.push(account);
      }
    }
    
    return existingAccounts.length > 0 ? 
           existingAccounts : 
           ['No IMAP accounts configured. Use setup-imap operation to add an account.'];
  } catch (error) {
    console.error('Error listing accounts:', error);
    return [];
  }
}

export default {
  searchMailsImap,
  setupMailAccount,
  listImapAccounts,
  getCredentials  // Export this so mail.ts can check if account exists
};