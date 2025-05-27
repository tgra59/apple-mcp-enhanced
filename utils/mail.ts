import { run } from "@jxa/run";
import { runAppleScript } from "run-applescript";

async function checkMailAccess(): Promise<boolean> {
  try {
    // First check if Mail is running
    const isRunning = await runAppleScript(`
tell application "System Events"
    return application process "Mail" exists
end tell`);

    if (isRunning !== "true") {
      console.error("Mail app is not running, attempting to launch...");
      try {
        await runAppleScript(`
tell application "Mail" to activate
delay 3`);
      } catch (activateError) {
        console.error("Error activating Mail app:", activateError);
        throw new Error(
          "Could not activate Mail app. Please start it manually.",
        );
      }
    }

    // Try to get the count of mailboxes as a simple test
    try {
      const mailboxCount = await runAppleScript(`
tell application "Mail"
    count every mailbox
end tell`);
      console.error(`Mail mailbox count: ${mailboxCount}`);
      return true;
    } catch (mailboxError) {
      console.error("Error accessing mailboxes:", mailboxError);

      // Try an alternative check
      try {
        const mailVersion = await runAppleScript(`
tell application "Mail"
    return its version
end tell`);
        console.error("Mail version:", mailVersion);
        
        // Test if we can access some basic properties of Mail
        const accountInfo = await runAppleScript(`
tell application "Mail"
    set info to ""
    try
        set acctCount to count of accounts
        set info to info & "Found " & acctCount & " accounts. "
    on error
        set info to info & "Could not access accounts. "
    end try
    
    try
        set inboxes to {}
        repeat with a in accounts
            try
                repeat with m in mailboxes of a
                    if name of m is "Inbox" then
                        set end of inboxes to name of a & ":" & name of m
                    end if
                end repeat
            on error
                -- Skip problem accounts
            end try
        end repeat
        
        if (count of inboxes) > 0 then
            set info to info & "Found " & (count of inboxes) & " inboxes."
        else
            set info to info & "No inboxes found."
        end if
    on error err
        set info to info & "Error finding inboxes: " & err
    end try
    
    return info
end tell`);
        
        console.error(`Mail account info: ${accountInfo}`);
        return true;
      } catch (versionError) {
        console.error("Error getting Mail version:", versionError);
        throw new Error(
          "Mail app is running but cannot access mailboxes. Please check permissions and configuration.",
        );
      }
    }
  } catch (error) {
    console.error("Mail access check failed:", error);
    throw new Error(
      `Cannot access Mail app. Please make sure Mail is running and properly configured. Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface EmailMessage {
  subject: string;
  sender: string;
  dateSent: string;
  content: string;
  isRead: boolean;
  mailbox: string;
}

async function getUnreadMails(limit = 10): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // First, try with AppleScript which might be more reliable for this case
    try {
      const script = `
tell application "Mail"
    set allMailboxes to every mailbox
    set resultList to {}

    repeat with m in allMailboxes
        try
            set unreadMessages to (messages of m whose read status is false)
            if (count of unreadMessages) > 0 then
                set msgLimit to ${limit}
                if (count of unreadMessages) < msgLimit then
                    set msgLimit to (count of unreadMessages)
                end if

                repeat with i from 1 to msgLimit
                    try
                        set currentMsg to item i of unreadMessages
                        set msgData to {subject:(subject of currentMsg), sender:(sender of currentMsg), ¬
                                        date:(date sent of currentMsg) as string, mailbox:(name of m)}

                        try
                            set msgContent to content of currentMsg
                            if length of msgContent > 500 then
                                set msgContent to (text 1 thru 500 of msgContent) & "..."
                            end if
                            set msgData to msgData & {content:msgContent}
                        on error
                            set msgData to msgData & {content:"[Content not available]"}
                        end try

                        set end of resultList to msgData
                    end try
                end repeat

                if (count of resultList) ≥ ${limit} then exit repeat
            end if
        end try
    end repeat

    return resultList
end tell`;

      const asResult = await runAppleScript(script);

      // If we got results, parse them
      if (asResult && asResult.toString().trim().length > 0) {
        try {
          // Try to parse as JSON if the result looks like JSON
          if (asResult.startsWith("{") || asResult.startsWith("[")) {
            const parsedResults = JSON.parse(asResult);
            if (Array.isArray(parsedResults) && parsedResults.length > 0) {
              return parsedResults.map((msg) => ({
                subject: msg.subject || "No subject",
                sender: msg.sender || "Unknown sender",
                dateSent: msg.date || new Date().toString(),
                content: msg.content || "[Content not available]",
                isRead: false, // These are all unread by definition
                mailbox: msg.mailbox || "Unknown mailbox",
              }));
            }
          }

          // If it's not in JSON format, try to parse the plist/record format
          const parsedEmails: EmailMessage[] = [];

          // Very simple parsing for the record format that AppleScript might return
          // This is a best-effort attempt and might not be perfect
          const matches = asResult.match(/\{([^}]+)\}/g);
          if (matches && matches.length > 0) {
            for (const match of matches) {
              try {
                // Parse key-value pairs
                const props = match.substring(1, match.length - 1).split(",");
                const emailData: { [key: string]: string } = {};

                for (const prop of props) {
                  const parts = prop.split(":");
                  if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(":").trim();
                    emailData[key] = value;
                  }
                }

                if (emailData.subject || emailData.sender) {
                  parsedEmails.push({
                    subject: emailData.subject || "No subject",
                    sender: emailData.sender || "Unknown sender",
                    dateSent: emailData.date || new Date().toString(),
                    content: emailData.content || "[Content not available]",
                    isRead: false,
                    mailbox: emailData.mailbox || "Unknown mailbox",
                  });
                }
              } catch (parseError) {
                console.error("Error parsing email match:", parseError);
              }
            }
          }

          if (parsedEmails.length > 0) {
            return parsedEmails;
          }
        } catch (parseError) {
          console.error("Error parsing AppleScript result:", parseError);
          // If parsing failed, continue to the JXA approach
        }
      }

      // If the raw result contains useful info but parsing failed
      if (asResult.includes("subject") && asResult.includes("sender")) {
        console.error("Returning raw AppleScript result for debugging");
        return [
          {
            subject: "Raw AppleScript Output",
            sender: "Mail System",
            dateSent: new Date().toString(),
            content: `Could not parse Mail data properly. Raw output: ${asResult}`,
            isRead: false,
            mailbox: "Debug",
          },
        ];
      }
    } catch (asError) {
      // Continue to JXA approach as fallback
    }

    console.error("Trying JXA approach for unread emails...");
    // Check Mail accounts as a different approach
    const accounts = await runAppleScript(`
tell application "Mail"
    set accts to {}
    repeat with a in accounts
        set end of accts to name of a
    end repeat
    return accts
end tell`);
    console.error("Available accounts:", accounts);

    // Try using direct AppleScript to check for unread messages across all accounts
    const unreadInfo = await runAppleScript(`
tell application "Mail"
    set unreadInfo to {}
    repeat with m in every mailbox
        try
            set unreadCount to count (messages of m whose read status is false)
            if unreadCount > 0 then
                set end of unreadInfo to {name of m, unreadCount}
            end if
        end try
    end repeat
    return unreadInfo
end tell`);
    console.error("Mailboxes with unread messages:", unreadInfo);

    // Fallback to JXA approach
    const unreadMails: EmailMessage[] = await run((limit: number) => {
      const Mail = Application("Mail");
      const results = [];

      try {
        const accounts = Mail.accounts();

        for (const account of accounts) {
          try {
            const accountName = account.name();
            try {
              const accountMailboxes = account.mailboxes();

              for (const mailbox of accountMailboxes) {
                try {
                  const boxName = mailbox.name();

                  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
                  let unreadMessages;
                  try {
                    unreadMessages = mailbox.messages.whose({
                      readStatus: false,
                    })();

                    const count = Math.min(
                      unreadMessages.length,
                      limit - results.length,
                    );
                    for (let i = 0; i < count; i++) {
                      try {
                        const msg = unreadMessages[i];
                        results.push({
                          subject: msg.subject(),
                          sender: msg.sender(),
                          dateSent: msg.dateSent().toString(),
                          content: msg.content()
                            ? msg.content().substring(0, 500)
                            : "[No content]",
                          isRead: false,
                          mailbox: `${accountName} - ${boxName}`,
                        });
                      } catch (msgError) {}
                    }
                  } catch (unreadError) {}
                } catch (boxError) {}

                if (results.length >= limit) {
                  break;
                }
              }
            } catch (mbError) {}

            if (results.length >= limit) {
              break;
            }
          } catch (accError) {}
        }
      } catch (error) {}

      return results;
    }, limit);

    return unreadMails;
  } catch (error) {
    console.error("Error in getUnreadMails:", error);
    throw new Error(
      `Error accessing mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Original mail module without IMAP imports

async function searchMails(
  searchTerm: string,
  limit = 10,
): Promise<EmailMessage[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // Check if Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 3
end if`);

    console.error(`Searching for emails containing: "${searchTerm}"`);
    
    // STEP 1: Try to find matches in unread emails (these are accessible through Mail API)
    try {
      // Get unread emails
      const unreadEmails: EmailMessage[] = await getUnreadMails(50);
      console.error(`Retrieved ${unreadEmails.length} unread emails to check`);
      
      // Search through unread emails
      const searchResults = unreadEmails.filter(email => {
        const subjectMatch = email.subject.toLowerCase().includes(searchTerm.toLowerCase());
        const contentMatch = email.content.toLowerCase().includes(searchTerm.toLowerCase());
        const senderMatch = email.sender.toLowerCase().includes(searchTerm.toLowerCase());
        return subjectMatch || contentMatch || senderMatch;
      });
      
      if (searchResults.length > 0) {
        console.error(`Found ${searchResults.length} matching emails among unread messages`);
        return searchResults.slice(0, limit);
      }
    } catch (unreadError) {
      console.error("Error searching unread emails:", unreadError);
    }
    
    // STEP 2: If no matches found in unread emails, try IMAP search
    console.error("No matches found in unread emails, trying IMAP search...");
    
    try {
      // Check if we have the gmail-test account configured
      const imapAccount = "gmail-test"; // Default IMAP account
      
      // Try to get credentials to check if account exists
      try {
        // This is a method in mail-imap.ts that gets credentials
        const credentials = await mailImap.getCredentials(imapAccount);
        
        if (credentials) {
          console.error(`Found IMAP account "${imapAccount}", using IMAP search as fallback`);
          
          // Use IMAP search as fallback
          const imapResults = await mailImap.searchMailsImap(imapAccount, searchTerm, limit);
          
          if (imapResults && imapResults.length > 0) {
            console.error(`IMAP search found ${imapResults.length} results`);
            return imapResults;
          }
          
          console.error("IMAP search returned no results");
        }
      } catch (credError) {
        console.error(`No IMAP credentials found for account "${imapAccount}":`, credError);
      }
    } catch (imapError) {
      console.error("Error during IMAP fallback search:", imapError);
    }
    
    // STEP 3: If no results from either method, return an informative message
    return [{
      subject: `Search results for "${searchTerm}"`,
      sender: "Apple MCP System",
      dateSent: new Date().toString(),
      content: 
        `No emails matching "${searchTerm}" were found.\n\n` +
        `We've searched both unread emails and tried IMAP search for archived emails. ` +
        `If you believe there should be emails matching this search, you may want to:\n\n` +
        `1. Check if your IMAP account is properly set up (using the 'setup-imap' operation)\n` +
        `2. Try a different search term\n` +
        `3. Open the Mail app directly and use its search feature\n\n` +
        `You can continue to use other Mail functionality through this interface.`,
      isRead: false,
      mailbox: "System Information"
    }];
  } catch (error) {
    console.error("Error in searchMails:", error);
    
    // Return a user-friendly error instead of throwing
    return [{
      subject: `Error searching for "${searchTerm}"`,
      sender: "Apple MCP System",
      dateSent: new Date().toString(),
      content: 
        `An error occurred while searching for emails containing "${searchTerm}".\n\n` +
        `Error details: ${error instanceof Error ? error.message : String(error)}\n\n` +
        `This may be due to Apple's security restrictions on mail access or IMAP configuration issues. ` +
        `Try using the unread operation to view recent emails, or open the Mail app directly for searching.`,
      isRead: false,
      mailbox: "System Error"
    }];
  }
}

async function sendMail(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<string | undefined> {
  try {
    if (!(await checkMailAccess())) {
      throw new Error("Could not access Mail app");
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    // Escape special characters in strings for AppleScript
    const escapedTo = to.replace(/"/g, '\\"');
    const escapedSubject = subject.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');
    const escapedCc = cc ? cc.replace(/"/g, '\\"') : "";
    const escapedBcc = bcc ? bcc.replace(/"/g, '\\"') : "";

    let script = `
tell application "Mail"
    set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}", visible:true}
    tell newMessage
        make new to recipient with properties {address:"${escapedTo}"}
`;

    if (cc) {
      script += `        make new cc recipient with properties {address:"${escapedCc}"}\n`;
    }

    if (bcc) {
      script += `        make new bcc recipient with properties {address:"${escapedBcc}"}\n`;
    }

    script += `    end tell
    send newMessage
    return "success"
end tell
`;

    try {
      const result = await runAppleScript(script);
      if (result === "success") {
        return `Email sent to ${to} with subject "${subject}"`;
        // biome-ignore lint/style/noUselessElse: <explanation>
      } else {
      }
    } catch (asError) {
      console.error("Error in AppleScript send:", asError);

      const jxaResult: string = await run(
        (to, subject, body, cc, bcc) => {
          try {
            const Mail = Application("Mail");

            const msg = Mail.OutgoingMessage().make();
            msg.subject = subject;
            msg.content = body;
            msg.visible = true;

            // Add recipients
            const toRecipient = Mail.ToRecipient().make();
            toRecipient.address = to;
            msg.toRecipients.push(toRecipient);

            if (cc) {
              const ccRecipient = Mail.CcRecipient().make();
              ccRecipient.address = cc;
              msg.ccRecipients.push(ccRecipient);
            }

            if (bcc) {
              const bccRecipient = Mail.BccRecipient().make();
              bccRecipient.address = bcc;
              msg.bccRecipients.push(bccRecipient);
            }

            msg.send();
            return "JXA send completed";
          } catch (error) {
            return `JXA error: ${error}`;
          }
        },
        to,
        subject,
        body,
        cc,
        bcc,
      );

      if (jxaResult.startsWith("JXA error:")) {
        throw new Error(jxaResult);
      }

      return `Email sent to ${to} with subject "${subject}"`;
    }
  } catch (error) {
    console.error("Error in sendMail:", error);
    throw new Error(
      `Error sending mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getMailboxes(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    // Ensure Mail app is running
    await runAppleScript(`
if application "Mail" is not running then
    tell application "Mail" to activate
    delay 2
end if`);

    const mailboxes: string[] = await run(() => {
      const Mail = Application("Mail");

      try {
        const mailboxes = Mail.mailboxes();

        if (!mailboxes || mailboxes.length === 0) {
          try {
            const result = Mail.execute({
              withObjectModel: "Mail Suite",
              withCommand: "get name of every mailbox",
            });

            if (result && result.length > 0) {
              return result;
            }
          } catch (execError) {}

          return [];
        }

        return mailboxes.map((box: unknown) => {
          try {
            return (box as { name: () => string }).name();
          } catch (nameError) {
            return "Unknown mailbox";
          }
        });
      } catch (error) {
        return [];
      }
    });

    return mailboxes;
  } catch (error) {
    console.error("Error in getMailboxes:", error);
    throw new Error(
      `Error getting mailboxes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getAccounts(): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const accounts = await runAppleScript(`
tell application "Mail"
    set acctNames to {}
    repeat with a in accounts
        set end of acctNames to name of a
    end repeat
    return acctNames
end tell`);

    return accounts ? accounts.split(", ") : [];
  } catch (error) {
    console.error("Error getting accounts:", error);
    throw new Error(
      `Error getting mail accounts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function getMailboxesForAccount(accountName: string): Promise<string[]> {
  try {
    if (!(await checkMailAccess())) {
      return [];
    }

    const mailboxes = await runAppleScript(`
tell application "Mail"
    set boxNames to {}
    try
        set targetAccount to first account whose name is "${accountName.replace(/"/g, '\\"')}"
        set acctMailboxes to every mailbox of targetAccount
        repeat with mb in acctMailboxes
            set end of boxNames to name of mb
        end repeat
    on error errMsg
        return "Error: " & errMsg
    end try
    return boxNames
end tell`);

    if (mailboxes?.startsWith("Error:")) {
      console.error(mailboxes);
      return [];
    }

    return mailboxes ? mailboxes.split(", ") : [];
  } catch (error) {
    console.error("Error getting mailboxes for account:", error);
    throw new Error(
      `Error getting mailboxes for account ${accountName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export default {
  getUnreadMails,
  searchMails,
  sendMail,
  getMailboxes,
  getAccounts,
  getMailboxesForAccount,
};
