import React, { useState, useEffect, useCallback } from 'react';
import { Editor, EditorState, ContentState, convertFromRaw, convertToRaw } from 'draft-js';
import ListOnlyEditor from 'imports/generator/ui/pages/ListOnlyEditor';
import { useMutation } from 'react-apollo';
import { UPDATE_BLOCK_ITEM_FIELD, ADD_BLOCK_ITEM } from '/imports/generator/api/apollo/client/mutations';
import { useReviewStore } from '/zustand/dataFetchZustand';
import { FetchDataFromApi } from 'imports/checkout/api/helpers';
import styled from 'styled-components';
import { blockItemImmutableUpdate } from '/imports/generator/api/apollo/client/helpers';

const AIReviewSection = ({ resumeId, token, onUpdateComplete, onRefreshRef }) => {
  const {
    reviewData,
    setReviewData,
    errorReview,
    setError,
    loadingReview,
    setLoading,
    hasFetched,
    editorStates,
    setEditorState,
    inputValues,
    setInputValue,
    createdItems,
    setCreatedItem, 
    checkedItems, 
    setCheckedItem, 
    setAllCheckedItems
  } = useReviewStore();

  const [updateBlockItemField] = useMutation(UPDATE_BLOCK_ITEM_FIELD);
  const [addBlockItem] = useMutation(ADD_BLOCK_ITEM);
  // const [checkedItems, setCheckedItems] = useState({});
  const [isFirstRender, setIsFirstRender] = useState(true);
  // const [editorStates, setEditorState] = useState({});
  // const [inputValues, setInputValue] = useState({});
  // const [createdItems, setCreatedItem] = useState({});

  const fetchData = useCallback(async () => {
    
    setLoading(true);
    try {
      const data = await FetchDataFromApi({ resumeId }, token);
      // console.log('🌐 Fetch success:', data);
      const initialCheckedItems = {};
      const initialInputValues = {};
      const initialEditorStates = {};

      data.edits.forEach((edit, index) => {
        const key = edit.isNewItem ? `${edit.blockId}_${edit.field}_${index}` : `${edit.itemId}_${edit.field}`;
        initialCheckedItems[key] = true;
        
        const newValue = typeof edit.newValue === 'string' ? edit.newValue : JSON.stringify(edit.newValue);

        if (edit.field === 'description') {
          initialEditorStates[key] = newValue;
        } else {
          initialInputValues[key] = extractPlainText(newValue);
        }
      });

      setReviewData(data);
       Object.entries(initialEditorStates).forEach(([k, v]) => setEditorState(k, v));
       Object.entries(initialInputValues).forEach(([k, v]) => setInputValue(k, v));
      setAllCheckedItems(initialCheckedItems);
      setLoading(false);
    } catch (err) {
      console.error('❌ Fetch failed:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [resumeId, token, setReviewData, setLoading, setError]);

  useEffect(() => {
    if (isFirstRender && !hasFetched) {
      // console.log('🔄 First time AI Review - fetching data');
      fetchData();
      setIsFirstRender(false);
    }
  }, [isFirstRender, hasFetched, fetchData]);

  useEffect(() => {
    if (onRefreshRef) onRefreshRef.current = fetchData;
  }, [fetchData, onRefreshRef]);

  const handleCheckbox = useCallback(
    (key) => setCheckedItem(key, !checkedItems[key]),
    [checkedItems, setCheckedItem])

  const handleGroupCheckbox = useCallback(
    (groupKey, itemKeys) => {
      const allSelected = itemKeys.every((k) => checkedItems[k]);
      itemKeys.forEach((k) => setCheckedItem(k, !allSelected));
    },
    [checkedItems, setCheckedItem],
  );

  const handleToggleSelectAll = useCallback(() => {
    const allSelected = Object.values(checkedItems).length > 0 && Object.values(checkedItems).every(Boolean);

    const updated = {};
    Object.keys(checkedItems).forEach((key) => (updated[key] = !allSelected));
    setAllCheckedItems(updated);
  }, [checkedItems, setAllCheckedItems]);

  const allSelected = Object.values(checkedItems).length > 0 && Object.values(checkedItems).every(Boolean);
  const toggleLabel = allSelected ? 'Deselect All' : 'Select All';

  const handleEditorChange = useCallback(
    (key, value) => {
      const content = value && typeof value === 'object' && 'target' in value ? value.target.value : value;
       setEditorState(key, content);
    },
    [setEditorState],
  );

  // const handleInputChange = useCallback(
  //   (key, event) => {
  //     const value = event.target.value;
  //     setInputValue((prev) => ({ ...prev, [key]: value }));
  //   },
  //   [setInputValue],
  // );
 
 const handleInputChange = useCallback(
   (key, eventOrValue) => {
     let newVal;

     if (eventOrValue?.target?.value !== undefined) {
       newVal = eventOrValue.target.value;
     } else {
       newVal = eventOrValue;
     }

     setInputValue(key, newVal);
   },
   [setInputValue],
 );



  const ReadOnlyDraft = ({ rawContent }) => {
    try {
      const parsed = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;

      const contentState = convertFromRaw(parsed);
      const editorState = EditorState.createWithContent(contentState);
      return <Editor editorState={editorState} readOnly={true} />;
    } catch (error) {
      return <div>{String(rawContent)}</div>;
    }
  };

  const extractPlainText = (value) => {
    if (!value) return '';

    // If it's already a string and not a JSON string, return as is
    if (typeof value === 'string') {
      // Check if it's a JSON string that needs parsing
      if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(value);
          return extractPlainText(parsed); 
        } catch {
          return value;
        }
      }
      return value;
    }

    // If it's an object (including arrays)
    if (typeof value === 'object' && value !== null) {
      // Handle Draft.js content
      if (value.blocks && Array.isArray(value.blocks)) {
        return value.blocks.map((b) => b.text).join('\n');
      }
      //  Handle social links or other complex objects
       if (value.url || value.link || value.href) {
         return value.url || value.link || value.href || '';
       }
      // if (value.url || value.link || value.href) {
      //   // For social links, return a formatted string showing both
      //   const url = value.url || value.link || value.href || '';
      //   const label = value.label || value.name || '';
      //   return JSON.stringify({ url, label }); 
      // }
      // Handle arrays
      if (Array.isArray(value)) {
        return value.map((item) => extractPlainText(item)).join(', ');
      }
      // Try to find meaningful string values in the object
      const stringValues = Object.values(value)
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .map((v) => v.trim());

      if (stringValues.length > 0) {
        return stringValues.join(', ');
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  const updateBlockItemLocal = useCallback(
    (blockId, itemId, field, value) => {
      if (!reviewData || !reviewData.blocks) {
        console.warn('⚠️ Skipping local update — no blocks in reviewData.');
        return;
      }

      const updater = blockItemImmutableUpdate((updatedBlock) => {
        console.log('Updated block from blockItemImmutableUpdate:', updatedBlock);
        setReviewData((prev) => {
          if (!prev || !prev.blocks) return prev;
          return {
            ...prev,
            blocks: prev.blocks.map((block) => (block.id === blockId ? updatedBlock : block)),
          };
        });
      });

      updater(resumeId, blockId, itemId, field)(value);
    },
    [resumeId, reviewData, setReviewData],
  );


  const handleApplyAllChanges = useCallback(async () => {
    const checkedKeys = Object.keys(checkedItems).filter((key) => checkedItems[key]);

    if (checkedKeys.length === 0) {
      alert('Please select at least one checkbox');
      return;
    }

    try {
      for (const key of checkedKeys) {
        const edit = reviewData.edits.find((e, i) => {
          const matchKey = e.isNewItem ? `${e.blockId}_${e.field}_${i}` : `${e.itemId}_${e.field}`;
          return matchKey === key;
        });
        if (!edit) continue;

        let currentValue;

        if (edit.field === 'description') {
          const editorValue = editorStates[key];
          if (editorValue === undefined) {
            console.warn('⚠️ Missing editor value for key:', key);
            continue; 
          }
          console.log('📝 Editor value for description:', editorValue);
          if (typeof editorValue === 'string' && editorValue.includes('"blocks"')) {
            currentValue = editorValue;
          }
          else if (typeof editorValue === 'string') {
            const contentState = ContentState.createFromText(editorValue);
            currentValue = JSON.stringify(convertToRaw(contentState));
          }
          else {
            currentValue = typeof edit.newValue === 'string' ? edit.newValue : JSON.stringify(edit.newValue);
          }
          }
        else {
          // currentValue = inputValues[key] || extractPlainText(edit.newValue);
          currentValue = inputValues[key] !== undefined ? inputValues[key] : extractPlainText(edit.newValue);

        }

        const existingItemId = createdItems[key];
        
        if (edit.isNewItem) {
          let itemIdToUse = existingItemId;
          
          if (!itemIdToUse) {
            const addResponse = await addBlockItem({
              variables: {
                resumeId,
                blockId: edit.blockId,
                animationKey: `new-item-${Date.now()}`,
              },
            });
            console.log('🆕 addBlockItem response:', addResponse);

            itemIdToUse = addResponse.data.addBlockItem.itemId;

            if (!itemIdToUse) {
              console.log('❌ Failed to retrieve new itemId after creation.');
              continue;
            }
            setCreatedItem(key, itemIdToUse);
          }

          
          let valuesToStore = {};

          if (typeof edit.newValue === 'object' && edit.newValue !== null) {
            // Use the user-edited object directly if available
            const editedObj = inputValues[key];
            valuesToStore = typeof editedObj === 'object' ? editedObj : edit.newValue;
          } else {
            const fieldForSingleValue = edit.field !== 'new-field' ? edit.field : 'value';
            valuesToStore[fieldForSingleValue] = inputValues[key] ?? extractPlainText(edit.newValue);
          }

          for (const fieldKey in valuesToStore) {
            const value = valuesToStore[fieldKey];
            if (value == null || value === '') continue;

            let finalValue = value;

            if (typeof value === 'object' && !Array.isArray(value)) {
              finalValue = value; 
            }
            console.log('finalValue', finalValue)
            await updateBlockItemField({
              variables: {
                docId: resumeId,
                blockId: edit.blockId,
                itemId: itemIdToUse,
                field: fieldKey,
                needUpdate: true,
                value: finalValue,
              },
            });
          }
        } else {
          // console.log({
          //     docId: resumeId,
          //     blockId: edit.blockId,
          //     itemId: edit.itemId,
          //     field: edit.field,
          //     needUpdate: true,
          //     value: currentValue,
          //   }
          // )
          updateBlockItemLocal(edit.blockId, edit.itemId, edit.field, currentValue)
          console.log('goes inside')

          await updateBlockItemField({
            variables: {
              docId: resumeId,
              blockId: edit.blockId,
              itemId: edit.itemId,
              field: edit.field,
              value: currentValue,
              needUpdate: true,
            },
            update: (cache, res) => {
              if(res?.data?.updateBlockItemField){
                updateBlockItemLocal(blockId, itemId, field, value);
              }
            }
          });
        }
      }

      console.log('✅ All changes applied successfully!');
      setAllCheckedItems({});
      // await fetchData();
      //  if (onUpdateComplete) {
      //   // console.log('here is the toggle function call for refresh --------------')
      //    onUpdateComplete();
      //  } else {
      //   console.log('⚠️ onUpdateComplete is undefined');
      //  }
      setTimeout(() => {
        if (onUpdateComplete) {
          console.log('🔄 Triggering parent form refresh...');
          onUpdateComplete();
        } else {
          console.warn('⚠️ onUpdateComplete is undefined');
        }
      }, 0);
       
    } catch (error) {
      console.error('❌ Error updating resume:', error);
    }
  }, [
    checkedItems,
    reviewData,
    // editorStates,
    // inputValues,
    resumeId,
    updateBlockItemField,
    addBlockItem,
    onUpdateComplete,
    createdItems,
    setCreatedItem,
    fetchData,
    setReviewData
  ]);

  if (loadingReview) return <LoadingText>Loading...</LoadingText>;
  if (errorReview) return <ErrorText>{errorReview}</ErrorText>;
  if (!reviewData) return <NoDataText>No data yet</NoDataText>;

  // group new items by blockId + field, using original index for stable keys
  const groupedNewItems = (reviewData?.edits || []).reduce((acc, edit, idx) => {
    if (!edit.isNewItem || edit.field === 'description') return acc;
    const groupKey = `${edit.blockId}_${edit.field}`;
    if (!acc[groupKey]) acc[groupKey] = { edits: [], firstIdx: idx };
    acc[groupKey].edits.push({ ...edit, originalIndex: idx });
    return acc;
  }, {});

  return (
    <MainWrapper>
      <SelectionBtnWrapper>
        <SelectAllbtn onClick={handleToggleSelectAll}>{toggleLabel}</SelectAllbtn>
      </SelectionBtnWrapper>

      <EditsList>
        {reviewData?.edits
          .filter((edit) => !edit.isNewItem)
          .map((edit, index) => {
            const key = edit.isNewItem ? `${edit.blockId}_${edit.field}_${index}` : `${edit.itemId}_${edit.field}`;
            const oldValue = typeof edit.oldValue === 'string' ? edit.oldValue : JSON.stringify(edit.oldValue);

            const displayValue =
              edit.field === 'description'
                ? editorStates[key] || extractPlainText(edit.newValue)
                : (inputValues[key] ?? extractPlainText(edit.newValue));

            return (
              <EditItem key={key}>
                <CheckboxInput
                  type="checkbox"
                  checked={checkedItems[key] || false}
                  onChange={() => handleCheckbox(key)}
                />
                <Suggestion>Suggestion {index + 1}</Suggestion>
                <EditContent>
                  <EditHeader>
                    <BlockType>{edit.blockType}</BlockType>
                  </EditHeader>

                  <ValuesContainer>
                    {!edit.isNewItem && (
                      <ValueSection>
                        <ValueLabel>Currunt Text:</ValueLabel>
                        <OldValueContainer>
                          <ValueText>
                            <ReadOnlyDraft rawContent={oldValue} />
                          </ValueText>
                        </OldValueContainer>
                      </ValueSection>
                    )}
                    {!edit.isNewItem && <ValueDivider />}

                    <ValueSection>
                      <ValueLabel>{edit.isNewItem ? 'New Block:' : 'Improved Text:'}</ValueLabel>
                      {edit.field === 'description' ? (
                        <EditorWrapper>
                          <ListOnlyEditor value={displayValue} onChange={(value) => handleEditorChange(key, value)} />
                        </EditorWrapper>
                      ) : (
                        <TextareaWrapper>
                          <HobbiesTextarea
                            type="text"
                            value={displayValue}
                            onChange={(event) => handleInputChange(key, event)}
                          />
                        </TextareaWrapper>
                      )}
                    </ValueSection>
                  </ValuesContainer>
                </EditContent>
              </EditItem>
            );
          })}

        {Object.entries(groupedNewItems || {}).map(([groupKey, { edits, firstIdx }]) => {
          const firstEdit = edits[0];
          const groupLabel = `${
            firstEdit.blockType
              ? firstEdit.blockType.charAt(0).toUpperCase() + firstEdit.blockType.slice(1).toLowerCase()
              : ''
          }`;

          const groupItemKeys = edits.map((edit) => `${edit.blockId}_${edit.field}_${edit.originalIndex}`);

          const allGroupChecked = groupItemKeys.every((key) => checkedItems[key]);
          const someGroupChecked = groupItemKeys.some((key) => checkedItems[key]);

          return (
            <EditItem key={groupKey}>
              <NewContainer>
                <CheckboxInput
                  type="checkbox"
                  checked={allGroupChecked}
                  indeterminate={someGroupChecked && !allGroupChecked ? 'true' : undefined}
                  onChange={() => handleGroupCheckbox(groupKey, groupItemKeys)}
                  data-inline="true"
                />
                <Suggestion>Suggestion {firstIdx + 1}</Suggestion>
              </NewContainer>
              <NewSuggestion>Suggested: {groupLabel}</NewSuggestion>

              <EditContent>
                {edits.map((edit, i) => {
                  const key = `${edit.blockId}_${edit.field}_${edit.originalIndex}`;

                  return (
                    <NewValueSection key={key}>
                      <ToggleButton onClick={() => handleCheckbox(key)} checked={checkedItems[key] || false}>
                        {checkedItems[key] ? 'x' : '+'}
                      </ToggleButton>
                      <FieldSet>
                        <Legend>{groupLabel}</Legend>
                        <GroupedContainer>
                          {(() => {
                            let parsedValue = edit.newValue;
                            try {
                              parsedValue =
                                typeof edit.newValue === 'string' ? JSON.parse(edit.newValue) : edit.newValue;
                            } catch {
                              /* ignore */
                            }

                            // If it's an object with key-value pairs, render inputs dynamically
                            if (parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)) {
                              const objValue =
                                inputValues[key] && typeof inputValues[key] === 'object'
                                  ? inputValues[key]
                                  : parsedValue;

                              return (
                                <UrlValueContainer style={{}}>
                                  {Object.entries(objValue).map(([subKey, subValue]) => (
                                    <UrlFieldSet key={subKey}>
                                      <UrlLegend>{subKey}</UrlLegend>
                                      <UrlInput
                                        type="text"
                                        value={subValue || ''}
                                        onChange={(e) => {
                                          // console.log('Typing...', e.target.value);
                                            const updatedObject = {
                                              ...objValue,
                                              [subKey]: e.target.value,
                                            }
                                            handleInputChange(key, updatedObject);
                                        }}
                                      />
                                    </UrlFieldSet>
                                  ))}
                                </UrlValueContainer>
                              );
                            }

                            // 🧩 Default fallback for primitive values
                            return (
                              <NonUrlFieldset>
                                <UrlLegend>{edit.field || 'Value'}</UrlLegend>
                                <UrlInput
                                  type="text"
                                  value={inputValues[key] ?? extractPlainText(edit.newValue)}
                                  onChange={(event) => {
                                     console.log('Typing...', event.target.value);
                                     handleInputChange(key, event)}
                                    }
                                />
                              </NonUrlFieldset>
                            );
                          })()}
                        </GroupedContainer>
                      </FieldSet>
                    </NewValueSection>
                  );
                })}
              </EditContent>
            </EditItem>
          );
        })}
      </EditsList>
      <ApplyButtonWrapper>
        <ApplyButton onClick={handleApplyAllChanges}>✅ Apply Changes</ApplyButton>
      </ApplyButtonWrapper>
    </MainWrapper>
  );
};

export default AIReviewSection;

const MainWrapper = styled.div`
  text-align: center;
  padding: 20px;
  font-size: 16px;
`;


const UrlFieldSet = styled.fieldset`
  flex: 1;
  min-width: 150px;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 8px 10px 4px 10px;
  position: relative;
`;

const UrlLegend = styled.legend`
   font-size: 12px;
    color: #666;
    padding: 0 5px;
    margin-left: 8px;
`;

const UrlInput = styled.input`
  width: 100%;
  padding: 6px;
  border: none;
  outline: none;
  background: transparent;
`;

const NonUrlFieldset = styled.fieldset`
  width: 100%;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 8px 10px 4px 10px;
`;

const GroupedContainer = styled.div`
  flex: 1;
`;

const UrlValueContainer = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;


const ToggleButton = styled.button`
  background-color: ${({ checked }) => (checked ? '#ff4d4d' : '#28a745')};
  color: white;
  border: none;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    transform: scale(1.1);
    opacity: 0.9;
  }
`;

const NewContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
`;

const NewValueSection = styled.div`
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FieldSet = styled.fieldset`
  width: 100%;
  text-align: left;
  border-radius: 6px;
`;

const Legend = styled.legend`
  text-align: left;
  margin-left: 8px;
  font-size: 12px;
  // fontWeight: bold;
`;

const SelectionBtnWrapper = styled.div`
  margin-bottom: 15px;
  display: flex;
  gap: 10px;
  justify-content: right;
`;

const NewSuggestion = styled.div`
  display: flex;
  margin-left: 25px;
  position: static;
  font-size: 16px;
  font-weight: 600;
`;

const SelectAllbtn = styled.button`
  padding: 8px 16px;
  background-color: #0070f3;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
`;

const DeselectAllbtn = styled.button`
  padding: 8px 16px;
  background-color: #6c757d;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
`;

const EditsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const EditItem = styled.li`
  border: 1px solid #adabab;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 15px;
  position: relative;
`;

const CheckboxInput = styled.input`
  position: absolute;
  cursor: pointer;
  left: 12px;
  top: 12px;
  &[data-inline='true'] {
    position: static;
    margin: 0;
  }
`;

const Suggestion = styled.div`
  position: absolute;
  left: 35px;
  font-weight: 500;
  font-size: large;
  top: 8px;
`;

const EditContent = styled.div`
  margin-left: 30px;
  text-align: left;
`;

const EditHeader = styled.p`
  font-weight: bold;
  border-bottom: 1px solid #7a7979;
  padding-bottom: 6px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 25px;
`;

const BlockType = styled.span`
  font-weight: bold;
`;

const ValuesContainer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  /* background-color: #666464ff; */
`;

const ValueSection = styled.div`
  flex: 1;
  /* background-color: lightblue; */
  width: 2vw;
  
  /* padding-top: 10px;
  padding-bottom: 10px; */
`;

const ValueLabel = styled.strong`
  display: block;
  margin-bottom: 4px;
`;

const ValueText = styled.p`
  margin-top: 4px;
  white-space: pre-wrap;
  line-height: 1.4;
`;

const OldValueContainer = styled.div`
  border: 1px solid #ccc;
  max-height: 200px;
  min-height: 200px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 6px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #888;
    border-radius: 8px;
    border: 2px solid #f0f0f0;
  }
`;

const ValueDivider = styled.div`
  width: 1px;
  background-color: #646363;
  margin: 0 10px;
`;

const TextareaWrapper = styled.div`
  margin-top: 4px;
  max-height: 200px;
  min-height: 200px;
  border: 1px solid #ccc;
  border-radius: 6px;
  /* min-width: 10vw; */
  /* background-color: #575757ff; */
`;

const HobbiesTextarea = styled.input`
  width: 100%;
  padding: 8px;
  /* border: 1px solid #ccc; */
  /* border-radius: 6px; */
  font-family: inherit;
  font-size: inherit;
  line-height: 1.4;
  border: none;
  
  /* background-color: #464545ff; */
  /* min-height: 120px; */
  /* resize: vertical; */
`;

const EditorWrapper = styled.div`
  margin-top: 4px;
  border: 1px solid #ccc;
  /* min-height: 120px; */
  /* width: 15vw; */
  padding: 8px;
  /* background-color: #797575ff; */
  border-radius: 6px;
`;

const ApplyButtonWrapper = styled.button`
  text-align: right;
  margin-top: 20px;
  background-color: transparent;
  margin-bottom: 20px;
  border: none;
`;

const ApplyButton = styled.button`
  align-self: flex-end;
  background-color: #0070f3;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: #0058c9;
  }
`;

const LoadingText = styled.p`
  text-align: center;
`;

const ErrorText = styled.p`
  color: red;
  text-align: center;
`;

const NoDataText = styled.p`
  text-align: center;
`;
