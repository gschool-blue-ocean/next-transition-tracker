import { useEffect, useState, useRef } from "react";
import { MdSend, MdOutlineModeEdit, MdOutlineDelete } from "react-icons/md";
import io from "socket.io-client";
import dynamic from "next/dynamic";
const QuillNoSSRWrapper = dynamic(import("react-quill"), {
  ssr: false,
  loading: () => <p>Loading ...</p>,
});
import { server } from "../../utility";
import "react-quill/dist/quill.snow.css";
import { useSelector } from "react-redux";

import styles from "../../styles/Chat.module.css";
const Chat = () => {
  /****** Getting state from redux ******/
  //cohortChat is an array of students from the given cohort

  const { activeStudent, cohortChat } = useSelector(
    ({ app: { activeStudent, cohortChat } }) => ({
      activeStudent,
      cohortChat,
    })
  );
  /****** END Getting state from redux ******/
   
  const [userData, setUserData] = useState({});
  const [editInfo, setEditInfo] = useState(null); // info to be sent when editing an existing message,is a object
  const [chatMessages, setChatMessages] = useState([]); //Chat messages to display
  const [socket, setSocket] = useState({}); // socket connection
  const [newMessage, setNewMessage] = useState("");
  const [ctrlDown, setCtrlDown] = useState(false);
  const [display, setDisplay] = useState({
    editBtns: false,
    comment: null,
  });

  useEffect(() => {
    (async () => {
      /****** Getting connected to the socket server ******/
      const userData = JSON.parse(sessionStorage.getItem("currentUser"));
      setUserData(userData);
      await fetch(`/api/socket`);
      const newSocket = io();
      setSocket(newSocket);
      // if any socket.on methods are put in a function will break and resend the message incrementenly

      !newSocket.connected &&
        newSocket.on("connect", () => {
          console.log("connected");
        });
      /****** END Getting connected to the socket server ******/

      /****** Setting the chat comments and joining socket rooms******/
      let comments;
      if (userData.admin && cohortChat[0]) {
        //// If the user is an admin and is in a group cohort chat then set the messages to display any admin messages sent to the cohort
        comments = await getCohortComments(cohortChat[0].cohort_id);
        //// If the user is an admin and is in a group cohort chat then join the admin cohort room
        newSocket.emit("admin_cohort_room", [
          cohortChat[0].cohort_id,
          userData.user_id,
        ]);
      } else {
        //// otherwise get all comments related to the student
        comments = await getStudentComments(
          userData.user_id /*activeStudent.user_id*/
        );
        //// join the respective chat room of the student
        userData.admin
          ? newSocket.emit("join_room", 9 /*activeStudent.user_id*/)
          : newSocket.emit("join_room", userData.user_id);
      }
      setChatMessages(comments);
      /****** END Setting the chat comments and joining socket rooms******/
      /****** Handle when the user recieves a message******/

      newSocket.on("recieve_message", (newMessage) => {
        console.log("message recieved", newMessage.content);
        setChatMessages((oldMsgs) => [...oldMsgs, newMessage]);
      });

      newSocket.on("edit_message", async (newMessage) => {
        console.log("edit message recieved", newMessage);
        const comments =
          userData.admin && cohortChat[0]
            ? await getCohortComments(cohortChat[0].cohort_id)
            : await getStudentComments(
                userData.user_id /*activeStudent.user_id*/
              );
        setChatMessages(comments);
      });
      /****** END Handle when the user recieves a message******/
    })();
  }, [cohortChat]);

  const submitMsg = async () => {
    try {
      const foundContent = /<[a-z]+>((\s|\W)*(\w|\d)+(\s|\W)*)+<\/[a-z]+>/g; //check for words, or content other then periods spaces
      if (!foundContent.test(newMessage)) return; // If newMeessage is empty dont send
      // Create a new comment object
      const newMessageObj = {
        student_id: !cohortChat[0] ? activeStudent.user_id : null,
        author_id: userData.user_id,
        author_name: `${userData.first} ${userData.last}`,
        content: newMessage,
        date_time: editInfo
          ? editInfo.date_time
          : new Date(Date.now()).toUTCString(),
      };
      //// Add properties to the newMessageObj depending on the usecase
      if (cohortChat[0]) newMessageObj.cohort_id = cohortChat[0].cohort_id;
      if (editInfo) newMessageObj.comment_id = editInfo.id;
      // Update chat display with newly typed message
      editInfo
        ? setChatMessages((oldMsgs) => {
            const newChat = oldMsgs;
            newChat[editInfo.index] = newMessageObj;
            return newChat;
          })
        : setChatMessages((oldMsgs) => [...oldMsgs, newMessageObj]);

      // send the new message to the server
      console.log(editInfo);

      editInfo !== null
        ? cohortChat[0]
          ? await socket.emit(
              "edit_cohort_message",
              newMessageObj,
              editInfo.id,
              cohortChat
            )
          : await socket.emit("edit_message", newMessageObj, editInfo.id)
        : cohortChat[0]
        ? await socket.emit("send_cohort_message", newMessageObj, cohortChat)
        : await socket.emit("send_new_message", newMessageObj);

      //reset input field
      setEditInfo(null);
      setNewMessage("");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className={styles.container}>
      {/* CREATE EXISTING MESSAGES */}
      <div className={styles.display}>
        {chatMessages.map(
          (
            {
              author_id,
              author_name,
              comment_id,
              content,
              date_time,
              student_id,
              cohort_id,
            },
            index
          ) => {
            return (
              <div
              key={comment_id}
                className={`${styles.message} ${
                  author_id === userData.user_id && styles.right
                }`}
                onMouseEnter={() => {
                  parseInt(userData.user_id) === parseInt(author_id) &&
                    setDisplay((old) => ({
                      editBtns: true,
                      comment: comment_id,
                    }));
                }}
                onMouseLeave={() =>
                  setDisplay((old) => ({ editBtns: false, comment: null }))
                }
              >
                {display.editBtns && comment_id === display.comment && (
                  <div className={styles.editContainer}>
                    <button
                      className={styles.editBtn}
                      onClick={() => {
                        setNewMessage(content);
                        setEditInfo({
                          id: comment_id,
                          cohort_id,
                          date_time,
                          index,
                        });
                      }}
                    >
                      <MdOutlineModeEdit />
                    </button>
                    <button
                      className={styles.editBtn}
                      onClick={() => {
                        setChatMessages((oldMsgs) => {
                          const newChat = oldMsgs;
                          newChat.splice(index, 1);
                          return newChat;
                        });

                        !cohortChat[0]
                          ? socket.emit("edit_message", null, comment_id, true)
                          : socket.emit(
                              "edit_cohort_message",
                              { author_id, date_time },
                              comment_id,
                              cohortChat,
                              true
                            );
                      }}
                    >
                      <MdOutlineDelete />
                    </button>
                  </div>
                )}
                <div className={styles.body}>
                  <div
                    className={styles.content}
                    dangerouslySetInnerHTML={{ __html: content }}
                  />
                  <p className={styles.time}>
                    {" "}
                    <i>{date_time}</i>
                  </p>
                </div>
                <strong className={` ${styles.name}`}>{author_name}</strong>
              </div>
            );
          }
        )}
      </div>
      {/* END CREATE EXISTING MESSAGES */}
      {/* CREATE A NEW  MESSAGE */}
      <div className={styles.newMsgWrapper}>
        <QuillNoSSRWrapper
          style={{
            height: "100%",
            maxHeight: "100%",
            width: "100%",
            maxWidth: "100%",
          }}
          theme="snow"
          onChange={setNewMessage}
          value={newMessage}
          onKeyDown={({ key }) => {
            key === "Control" && setCtrlDown(true);
          }}
          onKeyUp={({ key }) => {
            key === "Control" && setCtrlDown(false);
            key === "Enter" && ctrlDown && submitMsg();
          }}
        />
        <button
          tabIndex={1}
          className={styles.submit}
          onClick={() => submitMsg()}
        >
          <MdSend />
        </button>
      </div>

      {/*END CREATE A NEW  MESSAGE */}
    </div>
  );
};

export default Chat;

const getCohortComments = async (id) =>
  await (await fetch(`/api/comments/cohort/${id}`)).json();

const getStudentComments = async (id) =>
  await (await fetch(`/api/comments/student/${id}`)).json();
